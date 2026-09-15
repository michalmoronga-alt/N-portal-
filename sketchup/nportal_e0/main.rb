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
    VERSION        = '0.1.2'.freeze
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
      'focus_selection' => :cmd_focus_selection
    }.freeze

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
        view.zoom(sel)
        add_margin(view.camera)
        view.invalidate

        n = sel.length
        record('ok', id, "Zamerané: #{n} #{n == 1 ? 'objekt' : (n < 5 ? 'objekty' : 'objektov')}")
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
