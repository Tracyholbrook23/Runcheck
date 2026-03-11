require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VideoTrimmer'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'RunCheck'
  s.homepage       = 'https://github.com/runcheck/runcheck'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'

  # Source is a required field; local-only modules use a dummy git reference.
  s.source = { git: '' }

  s.dependency 'ExpoModulesCore'

  # Modular headers are required when mixing Swift and Objective-C across pods.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE'          => 'YES',
    'SWIFT_COMPILATION_MODE'  => 'wholemodule',
  }

  # All .swift source files in this directory (ios/).
  s.source_files = '**/*.{h,m,swift}'
end
