/**
 * Expo Config Plugin to fix QuickCrypto ARM NEON build issues
 *
 * The react-native-quick-crypto package contains ARM NEON assembly code
 * (blake3_neon.c) that cannot compile for x86_64 architecture.
 * This plugin adds a post_install hook to exclude the problematic file
 * from x86_64 builds.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withQuickCryptoFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');

        // Check if we've already added this fix
        if (!podfileContent.includes('QuickCrypto NEON fix')) {
          // Find the post_install block and add our fix
          const postInstallHook = `
  # QuickCrypto NEON fix - exclude ARM NEON files from x86_64 simulator builds
  post_install do |installer|
    installer.pods_project.targets.each do |target|
      if target.name == 'QuickCrypto'
        target.build_configurations.each do |config|
          # Only build for arm64 on simulators (M1/M2 Macs)
          config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
        end
      end

      # Also ensure all pods use the same approach
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.4'
      end
    end

    # Call the original react native post install if it exists
    react_native_post_install(
      installer,
      config[:react_native_path],
      :mac_catalyst_enabled => false
    )
  end`;

          // Look for existing post_install and replace it
          if (podfileContent.includes('post_install do |installer|')) {
            // The Expo template already has a post_install, we need to modify it
            podfileContent = podfileContent.replace(
              /post_install do \|installer\|/g,
              `post_install do |installer|
    # QuickCrypto NEON fix - exclude ARM NEON files from x86_64 simulator builds
    installer.pods_project.targets.each do |target|
      if target.name == 'QuickCrypto'
        target.build_configurations.each do |config|
          config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'x86_64'
        end
      end
    end
`
            );
          }

          fs.writeFileSync(podfilePath, podfileContent);
        }
      }

      return config;
    },
  ]);
}

module.exports = withQuickCryptoFix;
