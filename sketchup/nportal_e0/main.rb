# encoding: UTF-8
# N-portal E0 – prijímač povelov.
#
# Protokol (súbory v %USERPROFILE%\.n-portal\e0, prepísateľné premennou NPORTAL_DATA_DIR):
#   cmd\<id>.json  – povel od panela: {"id","action","created_at"(ms),"ttl_ms","source"}
#   state.txt      – stav prijímača pre panel (key=value, jeden riadok = jedna hodnota)
#   receiver.lock  – ochrana, aby povely spracovávala len jedna relácia SketchUpu
#   log.txt        – jednoduchý záznam udalostí
#
# Bezpečnosť: vykonajú sa len akcie zo zoznamu ALLOWED. Žiadne eval, žiadny shell.
require 'json'
require 'fileutils'

module NPortal
  module E0
    VERSION        = '0.3.0'.freeze
    # Dátový priečinok je mimo AppData: balíčkové aplikácie (napr. Claude desktop) majú AppData
    # presmerované do súkromnej kópie a ich zápisy by SketchUp nevidel. Rovnaká cesta je v service/src/config.ts.
    DATA_ROOT      = (ENV['NPORTAL_DATA_DIR'] || File.join(Dir.home, '.n-portal')).tr('\\', '/').freeze
    DATA_DIR       = File.join(DATA_ROOT, 'e0').freeze
    CMD_DIR        = File.join(DATA_DIR, 'cmd').freeze
    STATE_FILE     = File.join(DATA_DIR, 'state.txt').freeze
    LOCK_FILE      = File.join(DATA_DIR, 'receiver.lock').freeze
    LOG_FILE       = File.join(DATA_DIR, 'log.txt').freeze
    POLL_SEC       = 0.2
    HEARTBEAT_SEC  = 1.0
    DEFAULT_TTL_MS = 2000
    MAX_TTL_MS     = 10_000
    LOCK_STALE_SEC = 5
    STANDBY_RETRY_SEC = 2
    PROCESSED_MAX  = 200
    ZOOM_MARGIN    = 1.15   # kamera o 15 % ďalej od výberu = okraj okolo zameraných objektov

    ALLOWED = {
      'focus_selection' => :cmd_focus_selection,
      'view_top'        => :cmd_view_top,
      'view_front'      => :cmd_view_front,
      'view_left'       => :cmd_view_left,
      'view_previous'   => :cmd_view_previous,
      'view_all'        => :cmd_view_all,
      'isolate_toggle'         => :cmd_isolate_toggle,
      'hidden_objects_toggle'  => :cmd_hidden_objects_toggle
    }.freeze
    HISTORY_MAX = 20

    @history   = [] unless defined?(@history)    # vlastná história kamery (len zmeny vyvolané panelom)
    @isolation = nil unless defined?(@isolation) # { model_guid:, ids: [persistent_id…], at: } – čo izolácia skryla

    @timer     = nil unless defined?(@timer)
    @status    = 'stopped' unless defined?(@status)   # running | standby | stopped
    @processed = [] unless defined?(@processed)
    @last      = {} unless defined?(@last)
    @last_hb   = 0.0 unless defined?(@last_hb)

    class << self
      # ---------- životný cyklus ----------

      def running?
        !@timer.nil?
      end

      def start
        return puts('[N-portal E0] prijímač už beží') if running?
        FileUtils.mkdir_p(CMD_DIR)
        if foreign_lock_alive?
          unless @status == 'standby'
            @status = 'standby'
            log("standby: povely spracováva iná relácia SketchUpu (lock pid=#{lock_pid}); skúšam znova každé #{STANDBY_RETRY_SEC} s")
            puts '[N-portal E0] standby – iná relácia SketchUpu už prijíma povely; prevezmem, keď skončí.'
          end
          # v pohotovosti pravidelne skúšať, či druhá relácia skončila (napr. zatvorený starší SketchUp)
          @standby_timer ||= UI.start_timer(STANDBY_RETRY_SEC, true) { start unless running? }
          return
        end
        if @standby_timer
          UI.stop_timer(@standby_timer)
          @standby_timer = nil
          log('pohotovosť skončila, preberám príjem povelov')
        end
        write_lock
        @status = 'running'
        @timer = UI.start_timer(POLL_SEC, true) { tick }
        log("start pid=#{Process.pid} verzia=#{VERSION} sketchup=#{Sketchup.version}")
        write_state(force: true)
        puts "[N-portal E0] prijímač beží (pid #{Process.pid}). Priečinok: #{DATA_DIR}"
      end

      def stop
        if @timer
          UI.stop_timer(@timer)
          @timer = nil
        end
        if @standby_timer
          UI.stop_timer(@standby_timer)
          @standby_timer = nil
        end
        @status = 'stopped'
        write_state(force: true)
        File.delete(LOCK_FILE) if File.exist?(LOCK_FILE) && lock_pid == Process.pid
        log('stop')
        puts '[N-portal E0] prijímač zastavený.'
      rescue => e
        puts "[N-portal E0] stop: #{e.class}: #{e.message}"
      end

      def status_report
        {
          status: @status, pid: Process.pid, version: VERSION,
          data_dir: DATA_DIR, last: @last, processed: @processed.length
        }
      end

      # ---------- hlavná slučka ----------

      def tick
        process_commands
        write_state if Time.now.to_f - @last_hb >= HEARTBEAT_SEC
      rescue => e
        log("tick chyba: #{e.class}: #{e.message}")
      end

      # Dir.children namiesto Dir.glob: glob berie spätné lomky v ceste (%LOCALAPPDATA%) ako únikové znaky.
      def pending_command_files
        return [] unless File.directory?(CMD_DIR)
        Dir.children(CMD_DIR).select { |f| f.end_with?('.json') }.sort.map { |f| File.join(CMD_DIR, f) }
      rescue
        []
      end

      def process_commands
        pending_command_files.each do |path|
          raw = begin
            File.read(path, encoding: 'UTF-8')
          rescue
            nil
          end
          begin
            File.delete(path)
          rescue
            nil
          end
          next if raw.nil? || raw.strip.empty?
          handle_command(raw)
        end
      end

      def handle_command(raw)
        id = nil
        cmd = begin
          JSON.parse(raw)
        rescue JSON::ParserError
          nil
        end
        return record('rejected', nil, 'Nečitateľný povel') unless cmd.is_a?(Hash)

        id = cmd['id'].to_s.strip
        return record('rejected', nil, 'Povel bez ID') if id.empty?
        if @processed.include?(id)
          log("duplicitný povel #{id} – ignorované")
          return
        end
        remember(id)

        created = cmd['created_at'].to_i
        ttl     = cmd['ttl_ms'].nil? ? DEFAULT_TTL_MS : cmd['ttl_ms'].to_i.clamp(1, MAX_TTL_MS)
        age     = now_ms - created
        if created <= 0 || age > ttl || age < -MAX_TTL_MS
          return record('expired', id, "Povel je starý (#{age} ms), nevykonaný")
        end

        action  = cmd['action'].to_s
        handler = ALLOWED[action]
        return record('rejected', id, "Nepovolená akcia: #{action}") unless handler

        model = Sketchup.active_model
        return record('error', id, 'Žiadny otvorený model') unless model

        send(handler, model, id)
      rescue => e
        record('error', id, "#{e.class}: #{e.message}")
      end

      # ---------- povolené akcie ----------

      # Zamerať výber: priblíži označené objekty s okrajom, výber nemení.
      def cmd_focus_selection(model, id)
        sel = model.selection
        return record('error', id, 'Nič nie je vybrané') if sel.empty?

        view = model.active_view
        push_history(view.camera)
        view.zoom(sel)
        add_margin(view.camera)
        view.invalidate

        record('ok', id, "Zamerané: #{count_text(sel.length)}")
      end

      # Pohľady (E2): osi modelu, premietanie sa nemení, výber zostáva.
      # S výberom sa zameria výber; bez výberu celý model (bez zmeny modelu, len kamera).
      def cmd_view_top(model, id)
        set_view(model, id, 'Zhora', Geom::Vector3d.new(0, 0, 1), Geom::Vector3d.new(0, 1, 0))
      end

      def cmd_view_front(model, id)
        set_view(model, id, 'Spredu', Geom::Vector3d.new(0, -1, 0), Geom::Vector3d.new(0, 0, 1))
      end

      def cmd_view_left(model, id)
        set_view(model, id, 'Zľava', Geom::Vector3d.new(-1, 0, 0), Geom::Vector3d.new(0, 0, 1))
      end

      def set_view(model, id, name, eye_dir, up)
        view = model.active_view
        cam  = view.camera
        sel  = model.selection
        bounds = sel.empty? ? model.bounds : selection_bounds(sel)
        return record('error', id, "#{name}: model je prázdny") if bounds.empty?

        push_history(cam)
        center = bounds.center
        dist   = [bounds.diagonal * 2.0, 1000.mm].max
        cam.set(center.offset(eye_dir, dist), center, up)
        if sel.empty?
          view.zoom_extents
        else
          view.zoom(sel)
        end
        add_margin(view.camera)
        view.invalidate
        record('ok', id, sel.empty? ? "#{name}: celý model (nič nie je vybrané)" : "#{name}: #{count_text(sel.length)}")
      end

      # Predošlý pohľad: vráti kameru pred poslednou zmenou vyvolanou panelom. Nie je to Undo modelu.
      def cmd_view_previous(model, id)
        return record('error', id, 'Žiadny predošlý pohľad') if @history.empty?
        view = model.active_view
        h = @history.pop
        cam = view.camera
        cam.set(h[:eye], h[:target], h[:up])
        cam.perspective = h[:perspective]
        if h[:perspective]
          cam.fov = h[:fov] if h[:fov]
        else
          cam.height = h[:height] if h[:height]
        end
        view.invalidate
        record('ok', id, "Predošlý pohľad (zostáva #{@history.length})")
      end

      # Celý model: zoom extents, výber zostáva.
      def cmd_view_all(model, id)
        view = model.active_view
        push_history(view.camera)
        view.zoom_extents
        view.invalidate
        record('ok', id, 'Celý model')
      end

      # ---------- viditeľnosť (E3) ----------

      # Izolovať / obnoviť ako prepínač. Izolácia skryje viditeľné susedné objekty v aktuálnom
      # editačnom kontexte a zapamätá si ich; obnovenie odkryje len tie (čo bolo skryté predtým, ostane skryté).
      def cmd_isolate_toggle(model, id)
        return restore_isolation(model, id) if isolation_active?(model)

        sel = model.selection
        return record('error', id, 'Nič nie je vybrané – nie je čo izolovať') if sel.empty?

        to_hide = model.active_entities.select do |e|
          e.is_a?(Sketchup::Drawingelement) && e.visible? && !sel.contains?(e)
        end
        return record('error', id, 'Okolo výberu nie je čo skryť') if to_hide.empty?

        model.start_operation('N-portal: izolovať', true)
        to_hide.each { |e| e.hidden = true }
        model.commit_operation
        @isolation = { model_guid: model.guid, ids: to_hide.map(&:persistent_id), at: Time.now.to_i }
        model.active_view.invalidate
        write_state(force: true)
        record('ok', id, "Izolované: #{count_text(sel.length)}, skrytých #{to_hide.length}")
      end

      def restore_isolation(model, id)
        iso = @isolation
        @isolation = nil
        return record('error', id, 'Izolácia patrí inému modelu – zrušená') if iso[:model_guid] != model.guid

        found = model.find_entity_by_persistent_id(iso[:ids]) || []
        restored = 0
        model.start_operation('N-portal: obnoviť', true)
        found.each do |e|
          next unless e && e.valid? && e.respond_to?(:hidden?) && e.hidden?
          e.hidden = false
          restored += 1
        end
        model.commit_operation
        model.active_view.invalidate
        write_state(force: true)
        record('ok', id, "Obnovené: #{restored} z #{iso[:ids].length}")
      end

      def isolation_active?(model)
        !@isolation.nil? && model && @isolation[:model_guid] == model.guid
      end

      # Prepnúť zobrazenie skrytých objektov (View > Hidden Objects). Nemení skrytú geometriu ani tagy.
      def cmd_hidden_objects_toggle(model, id)
        ro  = model.rendering_options
        key = hidden_objects_key(ro)
        ro[key] = !ro[key]
        model.active_view.invalidate
        write_state(force: true)
        record('ok', id, ro[key] ? 'Skryté objekty: zobrazené' : 'Skryté objekty: skryté')
      end

      def hidden_objects_key(ro)
        ro['DrawHiddenObjects'].nil? ? 'DrawHidden' : 'DrawHiddenObjects'
      end

      def hidden_objects_shown?(model)
        ro = model.rendering_options
        ro[hidden_objects_key(ro)] ? 1 : 0
      rescue
        0
      end

      def push_history(cam)
        @history << {
          eye: cam.eye, target: cam.target, up: cam.up,
          perspective: cam.perspective?,
          fov: (cam.perspective? ? cam.fov : nil),
          height: (cam.perspective? ? nil : cam.height)
        }
        @history.shift while @history.length > HISTORY_MAX
      end

      def selection_bounds(sel)
        b = Geom::BoundingBox.new
        sel.each { |e| b.add(e.bounds) if e.respond_to?(:bounds) }
        b
      end

      def count_text(n)
        "#{n} #{n == 1 ? 'objekt' : (n < 5 ? 'objekty' : 'objektov')}"
      end

      def add_margin(camera)
        return if ZOOM_MARGIN == 1.0
        if camera.perspective?
          dir = camera.eye - camera.target
          return if dir.length == 0
          new_eye = camera.target.offset(dir, dir.length * ZOOM_MARGIN)
          camera.set(new_eye, camera.target, camera.up)
        else
          camera.height = camera.height * ZOOM_MARGIN
        end
      end

      # ---------- stav a záznamy ----------

      def record(status, id, message)
        @last = { id: id.to_s, status: status, message: message.to_s.gsub(/[\r\n]+/, ' '), at: Time.now.to_i }
        log("#{status} #{id} – #{@last[:message]}")
        write_state(force: true)
      end

      def write_state(force: false)
        now = Time.now.to_f
        return if !force && now - @last_hb < HEARTBEAT_SEC
        @last_hb = now
        model = Sketchup.active_model
        title = model ? model.title.to_s : ''
        title = 'Untitled' if model && title.empty?
        lines = [
          'schema=1',
          "receiver.version=#{VERSION}",
          "receiver.status=#{@status}",
          "receiver.pid=#{Process.pid}",
          "receiver.heartbeat=#{now.to_i}",
          "model.ready=#{model ? 1 : 0}",
          "model.title=#{title}",
          "selection.count=#{model ? model.selection.length : 0}",
          "isolation.active=#{isolation_active?(model) ? 1 : 0}",
          "isolation.count=#{isolation_active?(model) ? @isolation[:ids].length : 0}",
          "view.hidden_objects=#{model ? hidden_objects_shown?(model) : 0}",
          "last.id=#{@last[:id]}",
          "last.status=#{@last[:status]}",
          "last.message=#{@last[:message]}",
          "last.at=#{@last[:at]}",
          "written_at=#{now.to_i}"
        ]
        atomic_write(STATE_FILE, lines.join("\n") + "\n")
        write_lock if @status == 'running'
      rescue => e
        puts "[N-portal E0] write_state: #{e.class}: #{e.message}"
      end

      def atomic_write(path, content)
        tmp = "#{path}.tmp"
        File.write(tmp, content, encoding: 'UTF-8')
        File.rename(tmp, path)
      end

      def write_lock
        atomic_write(LOCK_FILE, { pid: Process.pid, at: Time.now.to_i }.to_json)
      end

      def lock_pid
        return nil unless File.exist?(LOCK_FILE)
        JSON.parse(File.read(LOCK_FILE))['pid'].to_i
      rescue
        nil
      end

      def foreign_lock_alive?
        return false unless File.exist?(LOCK_FILE)
        pid = lock_pid
        return false if pid.nil? || pid == Process.pid
        (Time.now - File.mtime(LOCK_FILE)) < LOCK_STALE_SEC
      end

      def remember(id)
        @processed << id
        @processed.shift while @processed.length > PROCESSED_MAX
      end

      def now_ms
        (Time.now.to_f * 1000).to_i
      end

      def log(msg)
        FileUtils.mkdir_p(DATA_DIR)
        if File.exist?(LOG_FILE) && File.size(LOG_FILE) > 200_000
          File.write(LOG_FILE, '', encoding: 'UTF-8')
        end
        File.open(LOG_FILE, 'a', encoding: 'UTF-8') do |f|
          f.puts "#{Time.now.strftime('%Y-%m-%d %H:%M:%S')} #{msg}"
        end
      rescue
        nil
      end

      # ---------- menu ----------

      def install_menu
        return if @menu_installed
        menu = UI.menu('Extensions').add_submenu('N-portal E0')
        menu.add_item('Spustiť prijímač')     { start }
        menu.add_item('Zastaviť prijímač')    { stop }
        menu.add_item('Stav do Ruby konzoly') { puts status_report.to_json }
        menu.add_item('Otvoriť priečinok dát') { FileUtils.mkdir_p(DATA_DIR); UI.openURL("file:///#{DATA_DIR.tr('\\', '/')}") }
        @menu_installed = true
      end
    end

    install_menu
    start
  end
end
