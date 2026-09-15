# encoding: UTF-8
# N-portal E0 – loader rozšírenia pre SketchUp.
# Registruje prijímač povelov (Extensions > N-portal E0). Samotná logika je v nportal_e0/main.rb.
require 'sketchup.rb'
require 'extensions.rb'

module NPortal
  module E0
    unless defined?(EXTENSION)
      EXTENSION = SketchupExtension.new('N-portal E0', File.join('nportal_e0', 'main'))
      EXTENSION.version     = '0.1.0'
      EXTENSION.creator     = 'NOXUN'
      EXTENSION.description = 'E0 – dôkaz ovládania: prijímač povelov z dotykového panela (PWA cez lokálnu službu). Jediná akcia: Zamerať výber.'
      Sketchup.register_extension(EXTENSION, true)
    end
  end
end
