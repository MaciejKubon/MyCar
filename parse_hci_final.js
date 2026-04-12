#!/usr/bin/env node
/**
 * Final parser — wyciąga komendy sterujące CaDA z btsnoop HCI log
 * Format: btsnoop v1, datalink 1002 (HCI UART H4)
 * 
 * Skupia się na Extended Advertising Data (opcode 0x2037) 
 * z Manufacturer ID 0xC200
 */

const fs = require('fs');
const filepath = process.argv[2] || 'btsnooz_hci.log.last';
const data = fs.readFileSync(filepath);

console.log(`Parsing: ${filepath} (${data.length} bytes)\n`);

// btsnoop header
const version = data.readUInt32BE(8);
const datalink = data.readUInt32BE(12);
console.log(`btsnoop v${version}, datalink ${datalink}`);

// Parse records properly for datalink 1002
// Record header: orig_len(4BE) + inc_len(4BE) + flags(4BE) + drops(4BE) + ts(8BE) = 24 bytes
const packets = [];
let offset = 16;
let parseErrors = 0;

while (offset + 24 <= data.length) {
    const origLen = data.readUInt32BE(offset);
    const incLen = data.readUInt32BE(offset + 4);
    const flags = data.readUInt32BE(offset + 8);
    const drops = data.readUInt32BE(offset + 12);
    const ts = data.readBigUInt64BE(offset + 16);
    offset += 24;

    // Validate
    if (incLen === 0 || incLen > 4096) {
        parseErrors++;
        if (parseErrors > 10) break;
        // Try to resync by scanning for known patterns
        offset -= 23;
        continue;
    }

    if (offset + incLen > data.length) break;

    packets.push({
        origLen, incLen, flags, ts,
        data: data.subarray(offset, offset + incLen)
    });

    offset += incLen;
}

console.log(`Parsed ${packets.length} records (${parseErrors} parse errors)\n`);

// If we couldn't parse records properly, fall back to raw scanning
if (packets.length < 10) {
    console.log('⚠️ Record parsing failed. Using raw byte scanning approach.\n');
    rawScanApproach(data);
} else {
    recordBasedApproach(packets);
}

// =========================================================================
function rawScanApproach(data) {
    // Find all Extended Advertising Data commands (opcode 0x2037)
    // In H4 format: 0x01 (HCI CMD) + 0x37 0x20 (opcode LE) + param_len

    console.log('='.repeat(70));
    console.log('SCANNING FOR LE EXTENDED ADVERTISING DATA (0x2037)');
    console.log('='.repeat(70) + '\n');

    const c200Commands = [];
    const c200Unique = new Map();

    for (let i = 0; i < data.length - 40; i++) {
        // Look for: 01 37 20 XX (HCI cmd, opcode 0x2037, param_len)
        if (data[i] === 0x01 && data[i + 1] === 0x37 && data[i + 2] === 0x20) {
            const paramLen = data[i + 3];
            if (paramLen < 4 || paramLen > 40) continue;

            // Extended Adv Data format after opcode+paramlen:
            // handle(1) + operation(1) + fragment_preference(1) + adv_data_len(1) + adv_data(N)
            const handle = data[i + 4];
            const operation = data[i + 5];  
            const fragPref = data[i + 6];
            const advDataLen = data[i + 7];

            if (advDataLen === 0 || advDataLen > 35 || i + 8 + advDataLen > data.length) continue;

            const advData = data.subarray(i + 8, i + 8 + advDataLen);

            // Parse AD structures
            let adOff = 0;
            while (adOff + 2 <= advData.length) {
                const adLen = advData[adOff];
                if (adLen === 0 || adOff + 1 + adLen > advData.length) break;
                const adType = advData[adOff + 1];

                if (adType === 0xFF && adLen >= 3) {
                    const companyId = advData.readUInt16LE(adOff + 2);
                    const mfgPayload = advData.subarray(adOff + 4, adOff + 1 + adLen);

                    if (companyId === 0xC200) {
                        const payloadHex = mfgPayload.toString('hex');
                        c200Commands.push({
                            offset: i,
                            handle, operation, advDataLen,
                            payloadHex,
                            payloadBytes: [...mfgPayload]
                        });

                        if (!c200Unique.has(payloadHex)) {
                            c200Unique.set(payloadHex, { count: 0, firstOffset: i, bytes: [...mfgPayload] });
                        }
                        c200Unique.get(payloadHex).count++;
                    }
                }

                adOff += 1 + adLen;
            }
        }
    }

    console.log(`Found ${c200Commands.length} Extended Adv packets with MFG 0xC200\n`);
    
    // Show first 30 packets chronologically  
    if (c200Commands.length > 0) {
        console.log('--- First 30 packets (chronological) ---\n');
        for (const cmd of c200Commands.slice(0, 30)) {
            const bytes = cmd.payloadBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`  @${cmd.offset}: [${bytes}] handle=${cmd.handle} op=${cmd.operation}`);
        }
    }

    // Unique commands
    console.log(`\n${'='.repeat(70)}`);
    console.log(`UNIQUE COMMANDS: ${c200Unique.size}`);
    console.log('='.repeat(70) + '\n');

    const sorted = [...c200Unique.entries()].sort((a, b) => a[1].firstOffset - b[1].firstOffset);

    for (let i = 0; i < sorted.length; i++) {
        const [hex, info] = sorted[i];
        const bytes = info.bytes;
        const byteStr = bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        const decStr = bytes.join(', ');

        console.log(`Command #${i + 1} (x${info.count}): ${hex}`);
        console.log(`  Bytes: ${byteStr}`);
        console.log(`  Dec:   ${decStr}`);
        console.log();
    }

    // Byte analysis
    if (sorted.length > 1) {
        analyzeBytes(sorted.map(([_, info]) => info.bytes));
    }

    // Also scan for FFF0 (device responses)
    scanForDeviceResponses(data);

    // JSON output
    outputJSON(sorted);
}

function recordBasedApproach(packets) {
    // Similar but working on parsed records
    const c200Commands = [];
    const c200Unique = new Map();

    for (let i = 0; i < packets.length; i++) {
        const pkt = packets[i].data;
        if (pkt.length < 4) continue;

        const h4type = pkt[0];
        if (h4type !== 0x01) continue; // only HCI commands

        const opcode = pkt.readUInt16LE(1);
        
        if (opcode === 0x2037 && pkt.length >= 8) {
            const paramLen = pkt[3];
            const handle = pkt[4];
            const operation = pkt[5];
            const fragPref = pkt[6];
            const advDataLen = pkt[7];

            if (advDataLen === 0 || 8 + advDataLen > pkt.length) continue;

            const advData = pkt.subarray(8, 8 + advDataLen);

            let adOff = 0;
            while (adOff + 2 <= advData.length) {
                const adLen = advData[adOff];
                if (adLen === 0 || adOff + 1 + adLen > advData.length) break;
                const adType = advData[adOff + 1];

                if (adType === 0xFF && adLen >= 3) {
                    const companyId = advData.readUInt16LE(adOff + 2);
                    const mfgPayload = advData.subarray(adOff + 4, adOff + 1 + adLen);

                    if (companyId === 0xC200) {
                        const payloadHex = mfgPayload.toString('hex');
                        c200Commands.push({
                            packetIndex: i,
                            timestamp: packets[i].ts,
                            handle, operation,
                            payloadHex,
                            payloadBytes: [...mfgPayload]
                        });

                        if (!c200Unique.has(payloadHex)) {
                            c200Unique.set(payloadHex, { count: 0, firstIndex: i, bytes: [...mfgPayload] });
                        }
                        c200Unique.get(payloadHex).count++;
                    }
                }

                adOff += 1 + adLen;
            }
        }
    }

    console.log('='.repeat(70));
    console.log(`Found ${c200Commands.length} packets with MFG 0xC200`);
    console.log(`Unique payloads: ${c200Unique.size}`);
    console.log('='.repeat(70) + '\n');

    // Show first 30
    for (const cmd of c200Commands.slice(0, 30)) {
        const bytes = cmd.payloadBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  Pkt#${cmd.packetIndex}: [${bytes}] handle=${cmd.handle}`);
    }

    const sorted = [...c200Unique.entries()].sort((a, b) => a[1].firstIndex - b[1].firstIndex);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`UNIQUE COMMANDS: ${c200Unique.size}`);
    console.log('='.repeat(70) + '\n');

    for (let i = 0; i < sorted.length; i++) {
        const [hex, info] = sorted[i];
        const byteStr = info.bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        console.log(`Command #${i + 1} (x${info.count}): ${hex}`);
        console.log(`  Bytes: ${byteStr}`);
        console.log(`  Dec:   ${info.bytes.join(', ')}`);
        console.log();
    }

    if (sorted.length > 1) {
        analyzeBytes(sorted.map(([_, info]) => info.bytes));
    }

    outputJSON(sorted);
}

function analyzeBytes(allBytes) {
    const minLen = Math.min(...allBytes.map(b => b.length));
    
    console.log('='.repeat(70));
    console.log(`BYTE-BY-BYTE ANALYSIS (${minLen} bytes per command, ${allBytes.length} unique commands)`);
    console.log('='.repeat(70) + '\n');

    for (let pos = 0; pos < minLen; pos++) {
        const values = new Set(allBytes.map(b => b[pos]));
        const vals = [...values].sort((a, b) => a - b);
        
        if (values.size === 1) {
            const v = vals[0];
            console.log(`  Byte[${pos.toString().padStart(2)}] = CONSTANT  0x${v.toString(16).padStart(2, '0')} (${v})`);
        } else if (values.size <= 10) {
            console.log(`  Byte[${pos.toString().padStart(2)}] = VARIABLE  [${vals.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', ')}]  (${values.size} unique)`);
        } else {
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            console.log(`  Byte[${pos.toString().padStart(2)}] = VARIABLE  range: 0x${min.toString(16).padStart(2, '0')}-0x${max.toString(16).padStart(2, '0')} (${values.size} unique values)`);
        }
    }

    // Look for patterns — are commands structured?
    console.log('\n\n--- Grouping by first 2 bytes (possible command type + sub-type) ---\n');
    const groups = new Map();
    for (const bytes of allBytes) {
        const key = bytes.slice(0, 2).map(b => b.toString(16).padStart(2, '0')).join('');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(bytes);
    }
    for (const [key, members] of [...groups.entries()].sort()) {
        console.log(`  Group 0x${key}: ${members.length} commands`);
        for (const m of members.slice(0, 5)) {
            console.log(`    ${m.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        }
        if (members.length > 5) console.log(`    ... and ${members.length - 5} more`);
    }
}

function scanForDeviceResponses(data) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('DEVICE RESPONSES (MFG 0xFFF0)');
    console.log('='.repeat(70) + '\n');

    const unique = new Map();

    for (let i = 1; i < data.length - 22; i++) {
        const adLen = data[i - 1];
        if (data[i] === 0xFF && adLen === 19) {
            if (i + 2 < data.length) {
                const cid = data.readUInt16LE(i + 1);
                if (cid === 0xFFF0) {
                    const payload = data.subarray(i + 3, i - 1 + adLen + 1);
                    const hex = payload.toString('hex');
                    if (!unique.has(hex)) {
                        unique.set(hex, 0);
                    }
                    unique.set(hex, unique.get(hex) + 1);
                }
            }
        }
    }

    console.log(`Unique device response payloads: ${unique.size}\n`);
    for (const [hex, count] of [...unique.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        const bytes = Buffer.from(hex, 'hex');
        console.log(`  x${count}: ${hex}`);
        console.log(`    Bytes: ${[...bytes].map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    }
}

function outputJSON(sorted) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('JSON OUTPUT (copy-paste ready for app)');
    console.log('='.repeat(70) + '\n');

    const commands = sorted.map(([hex, info], i) => ({
        id: i + 1,
        hex,
        bytes: info.bytes,
        count: info.count
    }));

    console.log(JSON.stringify(commands, null, 2));
}
