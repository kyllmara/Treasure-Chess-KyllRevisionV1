#!/usr/bin/env node

/**
 * Bundle Size Analyzer
 *
 * Analyzes the app bundle size and identifies large dependencies.
 * Run with: node scripts/analyze-bundle.js
 *
 * For detailed analysis, run:
 * npx expo export --platform ios --dump-sourcemap
 * npx source-map-explorer dist/bundles/ios-*.js
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

/**
 * Get size of a directory in bytes
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += stats.size;
    }
  }

  return totalSize;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze dependencies
 */
function analyzeDependencies() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const depSizes = [];

  console.log('\n📦 Analyzing dependency sizes...\n');

  for (const [name] of Object.entries(dependencies)) {
    const depPath = path.join(nodeModulesPath, name);
    const size = getDirectorySize(depPath);

    if (size > 0) {
      depSizes.push({ name, size });
    }
  }

  // Sort by size (largest first)
  depSizes.sort((a, b) => b.size - a.size);

  // Print top 30 largest dependencies
  console.log('Top 30 Largest Dependencies:');
  console.log('='.repeat(60));

  const top30 = depSizes.slice(0, 30);
  const totalTop30 = top30.reduce((sum, dep) => sum + dep.size, 0);

  top30.forEach((dep, index) => {
    const sizeStr = formatBytes(dep.size).padStart(12);
    const percentage = ((dep.size / totalTop30) * 100).toFixed(1).padStart(5);
    console.log(`${(index + 1).toString().padStart(2)}. ${dep.name.padEnd(35)} ${sizeStr} (${percentage}%)`);
  });

  const totalSize = depSizes.reduce((sum, dep) => sum + dep.size, 0);

  console.log('='.repeat(60));
  console.log(`\nTotal node_modules size: ${formatBytes(totalSize)}`);
  console.log(`Total dependencies: ${depSizes.length}`);

  // Identify potentially removable/replaceable dependencies
  console.log('\n⚠️  Large Dependencies to Review:');
  console.log('-'.repeat(60));

  const reviewThreshold = 1024 * 1024; // 1MB
  const largeOnes = depSizes.filter(d => d.size > reviewThreshold);

  if (largeOnes.length > 0) {
    largeOnes.forEach(dep => {
      console.log(`   ${dep.name}: ${formatBytes(dep.size)}`);
    });
    console.log('\nConsider:');
    console.log('   - Using lighter alternatives');
    console.log('   - Tree-shaking unused exports');
    console.log('   - Lazy loading where possible');
  } else {
    console.log('   No dependencies over 1MB found.');
  }

  return { depSizes, totalSize };
}

/**
 * Check for duplicate packages
 */
function checkDuplicates() {
  console.log('\n🔍 Checking for potential duplicates...\n');

  // Common packages that often have duplicates
  const commonDuplicates = [
    'react',
    'react-native',
    'lodash',
    'moment',
    'date-fns',
    'axios',
    'uuid',
  ];

  const duplicates = [];

  for (const pkg of commonDuplicates) {
    const pkgPath = path.join(nodeModulesPath, pkg);
    if (fs.existsSync(pkgPath)) {
      // Check for nested duplicates
      const nested = findNestedPackages(nodeModulesPath, pkg);
      if (nested.length > 0) {
        duplicates.push({ name: pkg, locations: nested.length + 1 });
      }
    }
  }

  if (duplicates.length > 0) {
    console.log('Potential duplicate packages found:');
    duplicates.forEach(d => {
      console.log(`   ${d.name}: ${d.locations} copies`);
    });
  } else {
    console.log('No obvious duplicates detected.');
  }
}

/**
 * Find nested instances of a package
 */
function findNestedPackages(baseDir, packageName, found = []) {
  const items = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      const fullPath = path.join(baseDir, item.name);

      if (item.name === 'node_modules') {
        const nestedPkgPath = path.join(fullPath, packageName);
        if (fs.existsSync(nestedPkgPath)) {
          found.push(nestedPkgPath);
        }
        findNestedPackages(fullPath, packageName, found);
      } else if (!item.name.startsWith('.') && !item.name.startsWith('@')) {
        // Check inside regular directories for node_modules
        const nestedNodeModules = path.join(fullPath, 'node_modules');
        if (fs.existsSync(nestedNodeModules)) {
          const nestedPkgPath = path.join(nestedNodeModules, packageName);
          if (fs.existsSync(nestedPkgPath)) {
            found.push(nestedPkgPath);
          }
          findNestedPackages(nestedNodeModules, packageName, found);
        }
      }
    }
  }

  return found;
}

/**
 * Bundle optimization suggestions
 */
function printOptimizationSuggestions() {
  console.log('\n💡 Bundle Optimization Suggestions:');
  console.log('='.repeat(60));

  const suggestions = [
    {
      title: 'Use dynamic imports for heavy screens',
      code: 'const HeavyComponent = React.lazy(() => import("./Heavy"));',
    },
    {
      title: 'Replace moment.js with date-fns or dayjs',
      code: 'import { format } from "date-fns"; // ~12KB vs ~280KB',
    },
    {
      title: 'Use specific lodash imports',
      code: 'import debounce from "lodash/debounce"; // Instead of import { debounce } from "lodash"',
    },
    {
      title: 'Enable Hermes engine (already default in Expo 50+)',
      code: 'Hermes reduces bundle size and improves startup time',
    },
    {
      title: 'Use expo-image instead of Image',
      code: 'expo-image has better caching and smaller memory footprint',
    },
    {
      title: 'Analyze with source-map-explorer',
      code: 'npx expo export --platform ios --dump-sourcemap && npx source-map-explorer dist/bundles/*.js',
    },
  ];

  suggestions.forEach((s, i) => {
    console.log(`\n${i + 1}. ${s.title}`);
    console.log(`   ${s.code}`);
  });
}

/**
 * Main analysis
 */
function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  BUNDLE SIZE ANALYZER');
  console.log('='.repeat(60));

  try {
    analyzeDependencies();
    checkDuplicates();
    printOptimizationSuggestions();

    console.log('\n' + '='.repeat(60));
    console.log('  Analysis Complete');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('Error during analysis:', error);
    process.exit(1);
  }
}

main();
