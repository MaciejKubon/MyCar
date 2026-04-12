#!/usr/bin/env node
/**
 * Debug tool — raw hex dump of btsnoop file header and first records
 */
const fs = require('fs');
const filepath = process.argv[2] || 'btsnooz_hci.log.last';
const data = fs.readFileSync(filepath);

console.log(`File: ${filepath}, Size: ${data.length} bytes\n`);

// Dump first 128 bytes as hex
console.log('=== FIRST 256 BYTES (hex + ascii) ===\n');
for (let i = 0; i < Math.min(256, data.length); i += 16) {
    const hexPart = [];
    const asciiPart = [];
    for (let j = 0; j < 16 && i + j < data.length; j++) {
        const b = data[i + j];
        hexPart.push(b.toString(16).padStart(2, '0'));
        asciiPart.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
    }
    console.log(`${i.toString(16).padStart(6, '0')}: ${hexPart.join(' ').padEnd(48)} ${asciiPart.join('')}`);
}

// Header analysis
console.log('\n=== HEADER ANALYSIS ===\n');
console.log(`Bytes 0-7 (magic): "${data.subarray(0, 8).toString('ascii').replace(/\0/g, '\\0')}" = ${data.subarray(0, 8).toString('hex')}`);
console.log(`Bytes 8-11 (version BE): ${data.readUInt32BE(8)} (0x${data.readUInt32BE(8).toString(16)})`);
console.log(`Bytes 8-11 (version LE): ${data.readUInt32LE(8)} (0x${data.readUInt32LE(8).toString(16)})`);
console.log(`Bytes 12-15 (datalink BE): ${data.readUInt32BE(12)} (0x${data.readUInt32BE(12).toString(16)})`);
console.log(`Bytes 12-15 (datalink LE): ${data.readUInt32LE(12)} (0x${data.readUInt32LE(12).toString(16)})`);

// Try reading first record at offset 16 with both endianness
console.log('\n=== FIRST RECORD AT OFFSET 16 ===\n');
console.log(`Bytes 16-19 (BE): ${data.readUInt32BE(16)} | (LE): ${data.readUInt32LE(16)}`);
console.log(`Bytes 20-23 (BE): ${data.readUInt32BE(20)} | (LE): ${data.readUInt32LE(20)}`);
console.log(`Bytes 24-27 (BE): ${data.readUInt32BE(24)} | (LE): ${data.readUInt32LE(24)}`);
console.log(`Bytes 28-31 (BE): ${data.readUInt32BE(28)} | (LE): ${data.readUInt32LE(28)}`);
console.log(`Bytes 32-39 (BE int64): ${data.readBigUInt64BE(32)}`);

// Datalink 1002 = HCI UART (H4)  
// The btsnoop format is ALWAYS big-endian, but maybe this file has a variant

// Let's try parsing with correct btsnoop format
// Record: origLen(4BE) + incLen(4BE) + flags(4BE) + drops(4BE) + timestamp(8BE) + data
console.log('\n=== ATTEMPTING RECORD PARSE ===\n');

let offset = 16;
for (let rec = 0; rec < 5 && offset + 24 <= data.length; rec++) {
    const origLen_be = data.readUInt32BE(offset);
    const incLen_be = data.readUInt32BE(offset + 4);
    const origLen_le = data.readUInt32LE(offset);
    const incLen_le = data.readUInt32LE(offset + 4);
    
    console.log(`Record ${rec} at offset ${offset}:`);
    console.log(`  BE: origLen=${origLen_be}, incLen=${incLen_be}`);
    console.log(`  LE: origLen=${origLen_le}, incLen=${incLen_le}`);
    console.log(`  Raw bytes: ${data.subarray(offset, offset + 24).toString('hex')}`);
    
    // Try with valid length
    let useLen = -1;
    let endian = '';
    if (incLen_be > 0 && incLen_be < 65535) {
        useLen = incLen_be;
        endian = 'BE';
    } else if (incLen_le > 0 && incLen_le < 65535) {
        useLen = incLen_le;
        endian = 'LE';
    }
    
    if (useLen > 0 && offset + 24 + useLen <= data.length) {
        console.log(`  Using ${endian} length: ${useLen}`);
        const pktData = data.subarray(offset + 24, offset + 24 + useLen);
        console.log(`  Packet data (first 32): ${pktData.subarray(0, Math.min(32, pktData.length)).toString('hex')}`);
        console.log(`  H4 type: 0x${pktData[0].toString(16)}`);
        
        offset += 24 + useLen;
    } else {
        console.log(`  ⚠️ No valid length found`);
        break;
    }
}

// Global scan for 0xC200 pattern
console.log('\n=== GLOBAL SCAN FOR 0xC200 (Company ID) ===\n');
let found = 0;
for (let i = 0; i < data.length - 2; i++) {
    // LE encoding: 0x00 0xC2
    if (data[i] === 0x00 && data[i + 1] === 0xC2) {
        found++;
        if (found <= 30) {
            const before = data.subarray(Math.max(0, i - 8), i).toString('hex');
            const after = data.subarray(i, Math.min(data.length, i + 24)).toString('hex');
            console.log(`  Match ${found} at offset ${i} (0x${i.toString(16)}):`);
            console.log(`    Before: ${before}`);
            console.log(`    After:  ${after}`);
        }
    }
}
console.log(`\nTotal 0x00 0xC2 matches: ${found}`);

// Also scan for the advertising opcode 0x2008
console.log('\n=== SCAN FOR OPCODE 0x2008 (LE Set Advertising Data) ===\n');
found = 0;
for (let i = 0; i < data.length - 2; i++) {
    // LE encoding: 0x08 0x20
    if (data[i] === 0x08 && data[i + 1] === 0x20) {
        found++;
        if (found <= 30) {
            const context = data.subarray(Math.max(0, i - 4), Math.min(data.length, i + 40)).toString('hex');
            console.log(`  Match ${found} at offset ${i}: ${context}`);
        }
    }
}
console.log(`Total 0x08 0x20 matches: ${found}`);

// Scan for opcode 0x2037 (extended)
console.log('\n=== SCAN FOR OPCODE 0x2037 (LE Extended Adv Data) ===\n');
found = 0;
for (let i = 0; i < data.length - 2; i++) {
    if (data[i] === 0x37 && data[i + 1] === 0x20) {
        found++;
        if (found <= 20) {
            const context = data.subarray(Math.max(0, i - 4), Math.min(data.length, i + 40)).toString('hex');
            console.log(`  Match ${found} at offset ${i}: ${context}`);
        }
    }
}
console.log(`Total: ${found}`);

// Scan for 0xFF (manufacturer data AD type) followed by something
console.log('\n=== SCAN FOR AD TYPE 0xFF (Manufacturer Specific) ===\n');
found = 0;
for (let i = 1; i < data.length - 4; i++) {
    const adLen = data[i - 1];
    if (data[i] === 0xFF && adLen >= 3 && adLen <= 25) {
        const companyId = data.readUInt16LE(i + 1);
        if (companyId === 0xC200 || companyId === 0x11AA || companyId === 0xFFF0 || companyId === 49664) {
            found++;
            if (found <= 30) {
                const payload = data.subarray(i + 3, i - 1 + adLen + 1);
                console.log(`  Match ${found} at offset ${i}: Company=0x${companyId.toString(16)} (${companyId})`);
                console.log(`    AD len=${adLen}, payload=${payload.toString('hex')}`);
                console.log(`    Context: ${data.subarray(Math.max(0, i - 5), Math.min(data.length, i + 25)).toString('hex')}`);
            }
        }
    }
}
console.log(`Total matches: ${found}`);
