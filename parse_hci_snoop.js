#!/usr/bin/env node
/**
 * Parser btsnoop HCI log (datalink type 1002 = HCI UART / H4)
 * Wyciąga pakiety BLE Advertising z Manufacturer ID 0xC200
 */

const fs = require('fs');

const filepath = process.argv[2] || 'btsnooz_hci.log.last';
console.log(`Parsing: ${filepath}`);

const rawData = fs.readFileSync(filepath);

// btsnoop header: 16 bytes
// "btsnoop\0" (8) + version(4 BE) + datalink(4 BE)
const magic = rawData.subarray(0, 8).toString('ascii');
console.log(`Magic: "${magic.replace('\0', '\\0')}"`);
console.log(`File size: ${rawData.length} bytes`);

if (magic !== 'btsnoop\x00') {
    console.error('Not a btsnoop file!');
    process.exit(1);
}

const version = rawData.readUInt32BE(8);
const datalink = rawData.readUInt32BE(12);
console.log(`Version: ${version}, Datalink type: ${datalink}`);

// Datalink 1002 = HCI UART (H4) — each packet has H4 type byte
// Datalink 2001 = HCI Unencapsulated
// Record format:
//   Original Length (4 BE)
//   Included Length (4 BE)
//   Packet Flags (4 BE)
//     bit 0: 0=sent, 1=received
//     bit 1: 0=data, 1=command/event
//   Cumulative Drops (4 BE) 
//   Timestamp (8 BE) — microseconds since Jan 1, 0001
//   Packet Data (Included Length bytes)

let packets = [];
let offset = 16; // after header

while (offset + 24 <= rawData.length) {
    const origLen = rawData.readUInt32BE(offset);
    const incLen = rawData.readUInt32BE(offset + 4);
    const flags = rawData.readUInt32BE(offset + 8);
    const drops = rawData.readUInt32BE(offset + 12);
    const timestamp = rawData.readBigUInt64BE(offset + 16);
    offset += 24;

    if (incLen === 0 || incLen > 65535 || offset + incLen > rawData.length) {
        console.log(`Invalid packet at offset ${offset - 24}: incLen=${incLen}`);
        break;
    }

    const pktData = Buffer.from(rawData.subarray(offset, offset + incLen));
    offset += incLen;

    const direction = (flags & 1) === 0 ? 'sent' : 'received';
    const isCommand = (flags & 2) !== 0;

    packets.push({
        origLen, incLen, flags, direction, isCommand,
        timestamp, data: pktData
    });
}

console.log(`\nParsed ${packets.length} HCI packets`);

// Count packet types
const typeCounts = {};
for (const p of packets) {
    const type = p.data.length > 0 ? p.data[0] : -1;
    const key = `0x${type.toString(16).padStart(2, '0')} (${p.direction})`;
    typeCounts[key] = (typeCounts[key] || 0) + 1;
}
console.log('\nPacket type breakdown:');
for (const [key, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const typeNames = {
        '0x01': 'HCI Command',
        '0x02': 'ACL Data',
        '0x03': 'SCO Data',
        '0x04': 'HCI Event',
        '0x05': 'ISO Data'
    };
    const hex = key.split(' ')[0];
    const name = typeNames[hex] || 'Unknown';
    console.log(`  ${key} ${name}: ${count}`);
}

// === EXTRACT ADVERTISING COMMANDS ===
console.log('\n' + '='.repeat(70));
console.log('SEARCHING FOR BLE ADVERTISING COMMANDS');
console.log('='.repeat(70) + '\n');

const advPackets = [];
const c200Packets = [];

for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    const data = p.data;
    if (data.length < 4) continue;

    const h4Type = data[0]; // H4 packet type indicator

    // H4 type 0x01 = HCI Command
    if (h4Type === 0x01 && data.length >= 4) {
        const opcode = data.readUInt16LE(1);
        const paramLen = data[3];

        // LE Set Advertising Data: opcode 0x2008
        // LE Set Scan Response Data: opcode 0x2009
        // LE Set Extended Advertising Data: opcode 0x2037
        if (opcode === 0x2008 || opcode === 0x2009 || opcode === 0x2037) {
            advPackets.push({
                index: i,
                opcode: '0x' + opcode.toString(16).padStart(4, '0'),
                paramLen,
                timestamp: p.timestamp,
                direction: p.direction,
                data
            });

            // Parse advertising data within the command
            // Format: H4(1) + opcode(2) + paramLen(1) + advDataLen(1) + advData(N)
            if (data.length >= 5) {
                const advDataLen = data[4];
                const advData = data.subarray(5, 5 + advDataLen);

                // Parse AD structures within advData
                let adOffset = 0;
                while (adOffset + 2 <= advData.length) {
                    const adLen = advData[adOffset];
                    if (adLen === 0 || adOffset + 1 + adLen > advData.length) break;

                    const adType = advData[adOffset + 1];

                    // 0xFF = Manufacturer Specific Data
                    if (adType === 0xFF && adLen >= 3) {
                        const companyId = advData.readUInt16LE(adOffset + 2);
                        const mfgPayload = advData.subarray(adOffset + 4, adOffset + 1 + adLen);

                        if (companyId === 0xC200) {
                            c200Packets.push({
                                index: i,
                                opcode: '0x' + opcode.toString(16).padStart(4, '0'),
                                timestamp: p.timestamp,
                                direction: p.direction,
                                companyId: '0xC200',
                                payload: mfgPayload.toString('hex'),
                                payloadBytes: [...mfgPayload],
                                rawPacket: data.toString('hex')
                            });
                        } else {
                            // Log other manufacturer IDs (first few)
                        }
                    }

                    adOffset += 1 + adLen;
                }
            }
        }

        // Also check Extended Advertising opcodes
        // LE Set Extended Advertising Parameters: 0x2036
        // LE Set Extended Advertising Enable: 0x2039
        // LE Set Extended Advertising Data: 0x2037
        if (opcode === 0x2036 || opcode === 0x2039) {
            // Just track these
        }
    }
}

console.log(`Found ${advPackets.length} LE Set Advertising Data commands`);
console.log(`Found ${c200Packets.length} packets with Manufacturer ID 0xC200`);

// If no c200 in adv commands, do brute-force on ALL packets
if (c200Packets.length === 0) {
    console.log('\n⚠️  No 0xC200 in advertising commands. Doing full brute-force scan...\n');

    let bruteCount = 0;
    const bruteResults = [];

    for (let i = 0; i < packets.length; i++) {
        const data = packets[i].data;
        for (let j = 0; j < data.length - 5; j++) {
            // Pattern: <adLen> 0xFF <companyID_LE>
            // Company ID 0xC200 in LE = 0x00 0xC2
            if (data[j + 1] === 0xFF && data[j + 2] === 0x00 && data[j + 3] === 0xC2) {
                const adLen = data[j];
                if (adLen >= 3 && adLen <= 30) {
                    bruteCount++;
                    const payload = data.subarray(j + 4, j + 1 + adLen);
                    bruteResults.push({
                        packetIndex: i,
                        h4Type: data[0],
                        direction: packets[i].direction,
                        offset: j,
                        adLen,
                        payload: payload.toString('hex'),
                        payloadBytes: [...payload],
                        context: data.subarray(Math.max(0, j - 2), Math.min(data.length, j + adLen + 3)).toString('hex')
                    });
                }
            }

            // Also try without AD structure — just raw 0x00 0xC2
            if (data[j] === 0x00 && data[j + 1] === 0xC2) {
                // Check if preceded by 0xFF (manufacturer specific data type)
                if (j > 0 && data[j - 1] === 0xFF) {
                    const payload = data.subarray(j + 2, j + 2 + 16);
                    if (!bruteResults.some(r => r.packetIndex === i && r.offset === j - 2)) {
                        bruteCount++;
                        bruteResults.push({
                            packetIndex: i,
                            h4Type: data[0],
                            direction: packets[i].direction,
                            offset: j,
                            adLen: 'N/A (raw)',
                            payload: payload.toString('hex'),
                            payloadBytes: [...payload],
                            context: data.subarray(Math.max(0, j - 3), Math.min(data.length, j + 20)).toString('hex')
                        });
                    }
                }
            }
        }
    }

    console.log(`Brute-force found ${bruteCount} potential 0xC200 matches\n`);

    for (const r of bruteResults.slice(0, 100)) {
        console.log(`  Packet #${r.packetIndex} | H4=0x${r.h4Type.toString(16)} | ${r.direction} | offset=${r.offset}`);
        console.log(`    AD Length: ${r.adLen}`);
        console.log(`    Payload:  ${r.payload}`);
        console.log(`    Bytes:    ${r.payloadBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        console.log(`    Context:  ${r.context}`);
        console.log();
    }

    // If we found results, analyze them
    if (bruteResults.length > 0) {
        // Convert to c200Packets format
        for (const r of bruteResults) {
            c200Packets.push({
                index: r.packetIndex,
                opcode: 'brute_force',
                timestamp: packets[r.packetIndex].timestamp,
                direction: r.direction,
                companyId: '0xC200',
                payload: r.payload,
                payloadBytes: r.payloadBytes,
                rawPacket: ''
            });
        }
    }
}

// Show first few advertising packets for debugging
if (advPackets.length > 0 && c200Packets.length === 0) {
    console.log('\nFirst 20 advertising data commands (for debugging):\n');
    for (const p of advPackets.slice(0, 20)) {
        console.log(`  #${p.index} | ${p.opcode} | ${p.direction} | paramLen=${p.paramLen}`);
        console.log(`    Full: ${p.data.toString('hex')}`);

        // Parse AD structures
        if (p.data.length >= 5) {
            const advDataLen = p.data[4];
            const advData = p.data.subarray(5, 5 + advDataLen);
            console.log(`    AdvData (${advDataLen} bytes): ${advData.toString('hex')}`);

            let adOff = 0;
            while (adOff + 2 <= advData.length) {
                const adLen = advData[adOff];
                if (adLen === 0) break;
                const adType = advData[adOff + 1];
                const adData = advData.subarray(adOff + 2, adOff + 1 + adLen);
                console.log(`      AD: len=${adLen} type=0x${adType.toString(16).padStart(2, '0')} data=${adData.toString('hex')}`);

                if (adType === 0xFF && adLen >= 3) {
                    const cid = advData.readUInt16LE(adOff + 2);
                    console.log(`        → Manufacturer Data: Company ID = 0x${cid.toString(16).padStart(4, '0')} (${cid})`);
                }

                adOff += 1 + adLen;
            }
        }
        console.log();
    }
}

// === ANALYZE COMMANDS ===
if (c200Packets.length > 0) {
    const uniqueCommands = new Map();
    for (const p of c200Packets) {
        if (!uniqueCommands.has(p.payload)) {
            uniqueCommands.set(p.payload, []);
        }
        uniqueCommands.get(p.payload).push(p.index);
    }

    console.log('\n' + '='.repeat(70));
    console.log(`UNIQUE COMMANDS FOUND: ${uniqueCommands.size}`);
    console.log('='.repeat(70) + '\n');

    const sorted = [...uniqueCommands.entries()].sort((a, b) => a[1][0] - b[1][0]);

    for (let i = 0; i < sorted.length; i++) {
        const [payload, indices] = sorted[i];
        const payloadBuf = Buffer.from(payload, 'hex');
        const byteList = [...payloadBuf].map(b => '0x' + b.toString(16).padStart(2, '0'));

        console.log(`Command #${i + 1}: (appeared ${indices.length}x)`);
        console.log(`  Hex:   ${payload}`);
        console.log(`  Bytes: ${byteList.join(' ')}`);
        console.log(`  Dec:   ${[...payloadBuf].join(', ')}`);
        console.log();
    }

    // Byte-by-byte analysis
    if (sorted.length > 1) {
        const allPayloads = sorted.map(([p]) => Buffer.from(p, 'hex'));
        const minLen = Math.min(...allPayloads.map(p => p.length));

        console.log('='.repeat(70));
        console.log('BYTE-BY-BYTE ANALYSIS');
        console.log('='.repeat(70) + '\n');

        for (let pos = 0; pos < minLen; pos++) {
            const values = new Set(allPayloads.map(p => p[pos]));
            if (values.size === 1) {
                const v = [...values][0];
                console.log(`  Byte[${pos}] CONSTANT = 0x${v.toString(16).padStart(2, '0')} (${v})`);
            } else {
                const vals = [...values].sort((a, b) => a - b);
                console.log(`  Byte[${pos}] VARIABLE (${values.size} unique: ${vals.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', ')})`);
            }
        }
    }

    // JSON output
    console.log('\n' + '='.repeat(70));
    console.log('COMMANDS JSON');
    console.log('='.repeat(70) + '\n');

    const cmdJson = sorted.map(([payload, indices], i) => ({
        id: i + 1,
        hex: payload,
        bytes: [...Buffer.from(payload, 'hex')],
        count: indices.length
    }));
    console.log(JSON.stringify(cmdJson, null, 2));

} else {
    console.log('\n⚠️  No Manufacturer ID 0xC200 data found anywhere in the log.');
    console.log('\nPossible reasons:');
    console.log('  1. The HCI log was captured BEFORE any commands were sent');
    console.log('  2. The advertising data uses a different mechanism not captured in HCI');
    console.log('  3. The file is corrupted or incomplete');
    console.log('\nRecommendation: Use nRF Connect on a second phone to sniff live packets');
    console.log('while pressing buttons in the CaDA app on the first phone.');

    // Let's also dump all unique opcodes we see
    console.log('\n\nAll HCI Command opcodes found:');
    const opcodes = new Map();
    for (const p of packets) {
        if (p.data.length >= 3 && p.data[0] === 0x01) {
            const op = p.data.readUInt16LE(1);
            const key = '0x' + op.toString(16).padStart(4, '0');
            opcodes.set(key, (opcodes.get(key) || 0) + 1);
        }
    }
    const sortedOps = [...opcodes.entries()].sort((a, b) => b[1] - a[1]);
    const bleOpcodeNames = {
        '0x2001': 'LE Set Event Mask',
        '0x2005': 'LE Set Advertising Parameters',
        '0x2006': 'LE Set Advertising Data',
        '0x2007': 'LE Set Scan Response Data',
        '0x2008': 'LE Set Advertising Data',
        '0x2009': 'LE Set Scan Enable',
        '0x200a': 'LE Set Scan Enable',
        '0x200b': 'LE Create Connection',
        '0x200c': 'LE Set Scan Parameters',
        '0x200d': 'LE Set Scan Enable (new)',
        '0x2036': 'LE Set Extended Adv Parameters',
        '0x2037': 'LE Set Extended Adv Data',
        '0x2038': 'LE Set Extended Scan Response Data',
        '0x2039': 'LE Set Extended Adv Enable',
        '0x203e': 'LE Set Extended Scan Parameters',
        '0x203f': 'LE Set Extended Scan Enable',
    };
    for (const [op, count] of sortedOps) {
        const name = bleOpcodeNames[op] || '';
        console.log(`  ${op} ${name}: ${count}`);
    }

    // Dump any LE advertising related commands
    console.log('\n\nDumping LE advertising-related commands:\n');
    const advOps = [0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x2036, 0x2037, 0x2038, 0x2039];
    let dumpCount = 0;
    for (let i = 0; i < packets.length && dumpCount < 50; i++) {
        const data = packets[i].data;
        if (data.length >= 3 && data[0] === 0x01) {
            const op = data.readUInt16LE(1);
            if (advOps.includes(op)) {
                dumpCount++;
                console.log(`  Packet #${i} | 0x${op.toString(16).padStart(4, '0')} | ${packets[i].direction}`);
                console.log(`    Full hex: ${data.toString('hex')}`);

                // Try to parse advertising data
                if ((op === 0x2006 || op === 0x2008) && data.length >= 5) {
                    const advLen = data[4];
                    const advData = data.subarray(5, 5 + advLen);
                    console.log(`    Adv data (${advLen}b): ${advData.toString('hex')}`);
                    parseAdStructures(advData);
                }

                if (op === 0x2037 && data.length >= 8) {
                    // Extended: handle(1) + operation(1) + fragment_preference(1) + adv_data_len(1) + data
                    const handle = data[4];
                    const operation = data[5];
                    const fragPref = data[6];
                    const extAdvLen = data[7];
                    const extAdvData = data.subarray(8, 8 + extAdvLen);
                    console.log(`    Ext Adv: handle=${handle} op=${operation} len=${extAdvLen}`);
                    console.log(`    Ext data: ${extAdvData.toString('hex')}`);
                    parseAdStructures(extAdvData);
                }

                console.log();
            }
        }
    }
}

function parseAdStructures(advData) {
    let adOff = 0;
    while (adOff + 2 <= advData.length) {
        const adLen = advData[adOff];
        if (adLen === 0 || adOff + 1 + adLen > advData.length) break;
        const adType = advData[adOff + 1];
        const adData = advData.subarray(adOff + 2, adOff + 1 + adLen);

        const typeNames = {
            0x01: 'Flags',
            0x02: 'Incomplete 16-bit UUID',
            0x03: 'Complete 16-bit UUID',
            0x06: 'Incomplete 128-bit UUID',
            0x07: 'Complete 128-bit UUID',
            0x08: 'Shortened Local Name',
            0x09: 'Complete Local Name',
            0x0A: 'TX Power Level',
            0xFF: 'Manufacturer Specific Data'
        };

        const typeName = typeNames[adType] || 'Unknown';
        console.log(`      AD: len=${adLen} type=0x${adType.toString(16).padStart(2, '0')} (${typeName}) data=${adData.toString('hex')}`);

        if (adType === 0xFF && adLen >= 3) {
            const cid = advData.readUInt16LE(adOff + 2);
            const mfgPayload = advData.subarray(adOff + 4, adOff + 1 + adLen);
            console.log(`        Company ID: 0x${cid.toString(16).padStart(4, '0')} (${cid})`);
            console.log(`        MFG Payload: ${mfgPayload.toString('hex')}`);
            console.log(`        MFG Bytes: ${[...mfgPayload].map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        }

        adOff += 1 + adLen;
    }
}
