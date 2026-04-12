#!/usr/bin/env node
/**
 * Szczegółowy parser — analizuje WSZYSTKIE pakiety zawierające 0xC200.
 * Podejście: raw scan po bajtach bez polegania na poprawnym parsowaniu recordów.
 */

const fs = require('fs');
const data = fs.readFileSync(process.argv[2] || 'btsnooz_hci.log.last');

console.log(`File size: ${data.length} bytes\n`);

// === KROK 1: Znajdź WSZYSTKIE miejsca z wzorcem 0xFF 0x00 0xC2 ===
// (AD type=Manufacturer Specific Data, Company ID=0xC200 little-endian)

console.log('='.repeat(70));
console.log('ALL OCCURRENCES OF "FF 00 C2" (MFG Data + Company 0xC200)');
console.log('='.repeat(70) + '\n');

const c200Hits = [];

for (let i = 0; i < data.length - 20; i++) {
    // Wzorzec: <adLen> FF 00 C2 <payload...>
    if (data[i + 1] === 0xFF && data[i + 2] === 0x00 && data[i + 3] === 0xC2) {
        const adLen = data[i];
        if (adLen >= 3 && adLen <= 30) {
            const payloadLen = adLen - 3; // odejmij: type(1) + companyID(2)
            const payload = data.subarray(i + 4, i + 4 + payloadLen);
            
            c200Hits.push({
                offset: i,
                adLen,
                payloadLen,
                payloadHex: payload.toString('hex'),
                payloadBytes: [...payload],
                // Context: 10 bytes before and after
                contextBefore: data.subarray(Math.max(0, i - 10), i).toString('hex'),
                contextAfter: data.subarray(i + 4 + payloadLen, Math.min(data.length, i + 4 + payloadLen + 10)).toString('hex')
            });
        }
    }
}

console.log(`Found ${c200Hits.length} MFG 0xC200 occurrences\n`);

// Show first 50
console.log('--- First 50 occurrences (chronological from file) ---\n');
for (let i = 0; i < Math.min(50, c200Hits.length); i++) {
    const h = c200Hits[i];
    const bytes = h.payloadBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  #${i+1} @${h.offset} adLen=${h.adLen} payload(${h.payloadLen}b): ${bytes}`);
}

// === KROK 2: Znajdź unikalne payloady ===
console.log(`\n${'='.repeat(70)}`);
console.log('UNIQUE PAYLOADS');
console.log('='.repeat(70) + '\n');

const unique = new Map();
for (const h of c200Hits) {
    if (!unique.has(h.payloadHex)) {
        unique.set(h.payloadHex, { count: 0, first: h, bytes: h.payloadBytes });
    }
    unique.get(h.payloadHex).count++;
}

const sorted = [...unique.entries()].sort((a, b) => a[1].first.offset - b[1].first.offset);

console.log(`Unique payloads: ${unique.size}\n`);

for (let i = 0; i < sorted.length; i++) {
    const [hex, info] = sorted[i];
    const bytes = info.bytes;
    const byteStr = bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    const decStr = bytes.map(b => b.toString().padStart(3)).join(' ');

    console.log(`CMD #${(i + 1).toString().padStart(3)}: x${info.count.toString().padStart(3)} | ${hex}`);
    console.log(`         ${byteStr}`);
    console.log(`         ${decStr}`);
    console.log();
}

// === KROK 3: Analiza bajtów ===
if (sorted.length > 1) {
    const allBytes = sorted.map(([_, info]) => info.bytes);
    const minLen = Math.min(...allBytes.map(b => b.length));
    
    console.log('='.repeat(70));
    console.log(`BYTE-BY-BYTE ANALYSIS (${minLen} bytes, ${allBytes.length} unique commands)`);
    console.log('='.repeat(70) + '\n');

    for (let pos = 0; pos < minLen; pos++) {
        const values = [...new Set(allBytes.map(b => b[pos]))].sort((a, b) => a - b);
        
        if (values.length === 1) {
            console.log(`  Byte[${pos.toString().padStart(2)}] CONST = 0x${values[0].toString(16).padStart(2, '0')} (${values[0]})`);
        } else if (values.length <= 15) {
            console.log(`  Byte[${pos.toString().padStart(2)}] VAR   = [${values.map(v => v.toString(16).padStart(2, '0')).join(' ')}] (${values.length} unique, dec: ${values.join(',')})`);
        } else {
            console.log(`  Byte[${pos.toString().padStart(2)}] VAR   = range ${values[0]}-${values[values.length-1]} (${values.length} unique)`);
        }
    }
}

// === KROK 4: Grupowanie po pierwszych bajtach ===
console.log(`\n${'='.repeat(70)}`);
console.log('GROUPING BY BYTE[0] (possible command category)');
console.log('='.repeat(70) + '\n');

const byByte0 = new Map();
for (const [hex, info] of sorted) {
    const b0 = info.bytes[0];
    if (!byByte0.has(b0)) byByte0.set(b0, []);
    byByte0.get(b0).push({ hex, ...info });
}

for (const [b0, cmds] of [...byByte0.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`\n  Byte[0] = 0x${b0.toString(16).padStart(2, '0')} (${b0}) — ${cmds.length} unique commands:`);
    for (const cmd of cmds) {
        const bytes = cmd.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`    x${cmd.count.toString().padStart(3)}: ${bytes}`);
    }
}

// === KROK 5: Analiza chronologiczna (próba zgadnięcia co to za komendy) ===
console.log(`\n\n${'='.repeat(70)}`);
console.log('CHRONOLOGICAL ANALYSIS — looking for command transitions');
console.log('='.repeat(70) + '\n');

let prev = '';
let transitionCount = 0;
for (let i = 0; i < c200Hits.length; i++) {
    const current = c200Hits[i].payloadHex;
    if (current !== prev) {
        transitionCount++;
        const bytes = c200Hits[i].payloadBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  Transition #${transitionCount} @offset=${c200Hits[i].offset}: ${bytes}  (prev was: ${prev ? prev.match(/../g).join(' ') : 'none'})`);
        prev = current;
    }
}
console.log(`\nTotal transitions: ${transitionCount}`);

// === KROK 6: Analiza odpowiedzi urządzenia (0xFFF0) ===
console.log(`\n\n${'='.repeat(70)}`);
console.log('DEVICE RESPONSES (MFG 0xFFF0 / 0x11AA)');
console.log('='.repeat(70) + '\n');

// 0xFFF0
let fff0Count = 0;
const fff0Unique = new Map();
for (let i = 0; i < data.length - 22; i++) {
    if (data[i + 1] === 0xFF && data[i + 2] === 0xF0 && data[i + 3] === 0xFF) {
        const adLen = data[i];
        if (adLen >= 3 && adLen <= 25) {
            fff0Count++;
            const payload = data.subarray(i + 4, i + 1 + adLen);
            const hex = payload.toString('hex');
            if (!fff0Unique.has(hex)) fff0Unique.set(hex, 0);
            fff0Unique.set(hex, fff0Unique.get(hex) + 1);
        }
    }
}

console.log(`MFG 0xFFF0: ${fff0Count} total, ${fff0Unique.size} unique payloads`);
for (const [hex, count] of [...fff0Unique.entries()].sort((a, b) => b[1] - a[1])) {
    const bytes = Buffer.from(hex, 'hex');
    console.log(`  x${count}: ${[...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}

// 0x11AA  
let aaCount = 0;
for (let i = 0; i < data.length - 4; i++) {
    if (data[i + 1] === 0xFF && data[i + 2] === 0xAA && data[i + 3] === 0x11) {
        const adLen = data[i];
        if (adLen >= 3 && adLen <= 25) {
            aaCount++;
            if (aaCount <= 10) {
                const payload = data.subarray(i + 4, i + 1 + adLen);
                console.log(`  MFG 0x11AA: ${payload.toString('hex')}`);
            }
        }
    }
}
console.log(`MFG 0x11AA: ${aaCount} total`);

// === JSON ===
console.log(`\n\n${'='.repeat(70)}`);
console.log('JSON');
console.log('='.repeat(70) + '\n');
console.log(JSON.stringify(sorted.map(([hex, info], i) => ({
    id: i + 1, hex, bytes: info.bytes, count: info.count
})), null, 2));
