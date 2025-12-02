/**
 * シンプルな動作確認テストスクリプト
 * 実行方法: node test-simple.js
 */

import { clamp, randomInt, randomFloat, lerp, mapRange, generateRandomValue } from './js/utils/mathUtils.js';
import { deepClone, shallowClone, cloneArray } from './js/utils/cloneUtils.js';
import { validateAudioFile, formatFileSize } from './js/utils/audioFileUtils.js';
import { calculateNormalizedSensitivity, valueToAngle, formatKnobValue } from './js/utils/knobUtils.js';

console.log('\n========================================');
console.log('🧪 動作確認テスト開始');
console.log('========================================\n');

let passCount = 0;
let failCount = 0;

// テストヘルパー関数
function test(name, condition, expected, actual) {
    if (condition) {
        console.log(`✅ ${name}`);
        passCount++;
    } else {
        console.log(`❌ ${name}`);
        console.log(`   期待値: ${expected}, 実際: ${actual}`);
        failCount++;
    }
}

// ========================================
// mathUtils.js のテスト
// ========================================
console.log('【1】mathUtils.js のテスト\n');

// clamp関数
console.log('▶ clamp関数:');
test('  clamp(5, 0, 10) = 5', clamp(5, 0, 10) === 5, 5, clamp(5, 0, 10));
test('  clamp(-5, 0, 10) = 0 (最小値)', clamp(-5, 0, 10) === 0, 0, clamp(-5, 0, 10));
test('  clamp(15, 0, 10) = 10 (最大値)', clamp(15, 0, 10) === 10, 10, clamp(15, 0, 10));

// randomInt関数
console.log('\n▶ randomInt関数:');
const randInt = randomInt(1, 10);
test('  randomInt(1, 10) は1以上', randInt >= 1, '>=1', randInt);
test('  randomInt(1, 10) は10以下', randInt <= 10, '<=10', randInt);
test('  randomInt(1, 10) は整数', Number.isInteger(randInt), 'integer', randInt);

// randomFloat関数
console.log('\n▶ randomFloat関数:');
const randFloat = randomFloat(0.0, 1.0);
test('  randomFloat(0.0, 1.0) は0以上', randFloat >= 0.0, '>=0.0', randFloat.toFixed(3));
test('  randomFloat(0.0, 1.0) は1以下', randFloat <= 1.0, '<=1.0', randFloat.toFixed(3));

// lerp関数
console.log('\n▶ lerp関数:');
test('  lerp(0, 10, 0.5) = 5', lerp(0, 10, 0.5) === 5, 5, lerp(0, 10, 0.5));
test('  lerp(0, 100, 0.25) = 25', lerp(0, 100, 0.25) === 25, 25, lerp(0, 100, 0.25));

// mapRange関数
console.log('\n▶ mapRange関数:');
const mapped = mapRange(5, 0, 10, 0, 100);
test('  mapRange(5, 0, 10, 0, 100) = 50', mapped === 50, 50, mapped);

// generateRandomValue関数
console.log('\n▶ generateRandomValue関数:');
const volumeSpec = { id: 'volume', min: 0, max: 1, step: 0.01 };
const volumeValue = generateRandomValue(volumeSpec);
test('  volume値は0.3以上', volumeValue >= 0.3, '>=0.3', volumeValue.toFixed(2));
test('  volume値は0.8以下', volumeValue <= 0.8, '<=0.8', volumeValue.toFixed(2));

const intSpec = { id: 'grainSize', min: 10, max: 100, step: 10 };
const intValue = generateRandomValue(intSpec);
test('  整数値は範囲内', intValue >= 10 && intValue <= 100, '10-100', intValue);
test('  整数値は整数', Number.isInteger(intValue), 'integer', intValue);

// ========================================
// cloneUtils.js のテスト
// ========================================
console.log('\n\n【2】cloneUtils.js のテスト\n');

// deepClone関数
console.log('▶ deepClone関数:');
const original = { a: 1, b: { c: 2 }, d: [3, 4] };
const cloned = deepClone(original);
test('  値が同じ', JSON.stringify(cloned) === JSON.stringify(original), 'equal', 'equal');
test('  参照が異なる', cloned !== original, 'different ref', cloned !== original);
test('  ネストされたオブジェクトも異なる参照', cloned.b !== original.b, 'different nested ref', cloned.b !== original.b);

// 変更しても元に影響しない
cloned.b.c = 999;
test('  元のオブジェクトは変更されない', original.b.c === 2, 2, original.b.c);

// null/undefined
console.log('\n▶ deepClone (null/undefined):');
test('  deepClone(null) = null', deepClone(null) === null, null, deepClone(null));
test('  deepClone(undefined) = undefined', deepClone(undefined) === undefined, undefined, deepClone(undefined));

// shallowClone関数
console.log('\n▶ shallowClone関数:');
const original2 = { a: 1, b: { c: 2 } };
const shallowCloned = shallowClone(original2);
test('  値が同じ', JSON.stringify(shallowCloned) === JSON.stringify(original2), 'equal', 'equal');
test('  参照が異なる', shallowCloned !== original2, 'different ref', shallowCloned !== original2);
test('  ネストされたオブジェクトは同じ参照（浅いコピー）', shallowCloned.b === original2.b, 'same nested ref', shallowCloned.b === original2.b);

// cloneArray関数
console.log('\n▶ cloneArray関数:');
const arr = [1, 2, [3, 4]];
const clonedArr = cloneArray(arr, true);
test('  配列が同じ', JSON.stringify(clonedArr) === JSON.stringify(arr), 'equal', 'equal');
test('  参照が異なる', clonedArr !== arr, 'different ref', clonedArr !== arr);
test('  ネストされた配列も異なる参照', clonedArr[2] !== arr[2], 'different nested ref', clonedArr[2] !== arr[2]);

// ========================================
// audioFileUtils.js のテスト
// ========================================
console.log('\n\n【3】audioFileUtils.js のテスト\n');

// formatFileSize関数
console.log('▶ formatFileSize関数:');
test('  formatFileSize(0) = "0 Bytes"', formatFileSize(0) === '0 Bytes', '0 Bytes', formatFileSize(0));
test('  formatFileSize(1024) = "1 KB"', formatFileSize(1024) === '1 KB', '1 KB', formatFileSize(1024));
test('  formatFileSize(1048576) = "1 MB"', formatFileSize(1048576) === '1 MB', '1 MB', formatFileSize(1048576));
test('  formatFileSize(1536) = "1.5 KB"', formatFileSize(1536) === '1.5 KB', '1.5 KB', formatFileSize(1536));

// validateAudioFile関数
console.log('\n▶ validateAudioFile関数:');

const noFile = validateAudioFile(null);
test('  ファイルなし → valid=false', noFile.valid === false, false, noFile.valid);
test('  ファイルなし → エラーメッセージあり', noFile.error !== null, 'has error', noFile.error);

const largeFile = {
    size: 101 * 1024 * 1024, // 101MB
    name: 'large.wav',
    type: 'audio/wav'
};
const largeResult = validateAudioFile(largeFile);
test('  大きすぎるファイル(101MB) → valid=false', largeResult.valid === false, false, largeResult.valid);
test('  大きすぎるファイル → エラーメッセージあり', largeResult.error !== null, 'has error', largeResult.error);

const mediumFile = {
    size: 60 * 1024 * 1024, // 60MB
    name: 'medium.wav',
    type: 'audio/wav'
};
const mediumResult = validateAudioFile(mediumFile);
test('  中サイズファイル(60MB) → valid=true', mediumResult.valid === true, true, mediumResult.valid);
test('  中サイズファイル → 警告あり', mediumResult.warning !== null, 'has warning', mediumResult.warning);

const validFile = {
    size: 1024 * 1024, // 1MB
    name: 'sample.wav',
    type: 'audio/wav'
};
const validResult = validateAudioFile(validFile);
test('  正常なファイル(1MB) → valid=true', validResult.valid === true, true, validResult.valid);
test('  正常なファイル → エラーなし', validResult.error === null, null, validResult.error);

// ========================================
// knobUtils.js のテスト
// ========================================
console.log('\n\n【4】knobUtils.js のテスト\n');

// calculateNormalizedSensitivity関数
console.log('▶ calculateNormalizedSensitivity関数:');
const sensitivity1 = calculateNormalizedSensitivity(0, 100);
test('  0-100の範囲 → 0.5', sensitivity1 === 0.5, 0.5, sensitivity1);

const sensitivity2 = calculateNormalizedSensitivity(0, 200);
test('  0-200の範囲 → 1.0', sensitivity2 === 1.0, 1.0, sensitivity2);

// valueToAngle関数
console.log('\n▶ valueToAngle関数:');
const angle1 = valueToAngle(0, 0, 100);
test('  値0 → 角度-135°', angle1 === -135, -135, angle1);

const angle2 = valueToAngle(50, 0, 100);
test('  値50 → 角度0°', angle2 === 0, 0, angle2);

const angle3 = valueToAngle(100, 0, 100);
test('  値100 → 角度135°', angle3 === 135, 135, angle3);

// formatKnobValue関数
console.log('\n▶ formatKnobValue関数:');
test('  formatKnobValue(5.678, 1) = 6', formatKnobValue(5.678, 1) === 6, 6, formatKnobValue(5.678, 1));
test('  formatKnobValue(5.678, 0.1) = "5.7"', formatKnobValue(5.678, 0.1) === '5.7', '5.7', formatKnobValue(5.678, 0.1));
test('  formatKnobValue(5.678, 0.01) = "5.68"', formatKnobValue(5.678, 0.01) === '5.68', '5.68', formatKnobValue(5.678, 0.01));

// ========================================
// テスト結果サマリー
// ========================================
console.log('\n========================================');
console.log('🎯 テスト結果サマリー');
console.log('========================================');
console.log(`✅ 成功: ${passCount}件`);
console.log(`❌ 失敗: ${failCount}件`);
console.log(`📊 合計: ${passCount + failCount}件`);
console.log(`📈 成功率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
console.log('========================================\n');

if (failCount === 0) {
    console.log('🎉 すべてのテストが成功しました！\n');
    process.exit(0);
} else {
    console.log('⚠️  いくつかのテストが失敗しました。上記を確認してください。\n');
    process.exit(1);
}
