#!/usr/bin/env python3
"""
Parser pliku btsnooz_hci.log.last — wyciąga pakiety BLE Advertising
z Manufacturer ID 0xC200 (49664) czyli komendy sterujące CaDA.

Format btsnooz:
  0-7:   "btsnooz\x00" (magic)
  8:     version
  9-16:  last timestamp (big-endian int64)
  17+:   zlib compressed data

Po dekompresji — pakiety HCI w ODWROTNEJ kolejności:
  Każdy rekord:
    0-3:  original length (big-endian uint32)
    4-7:  included length (big-endian uint32)  
    8-11: packet flags (big-endian uint32)
    12-15: cumulative drops (big-endian uint32)
    16-23: timestamp (big-endian int64, microseconds)
    24+:  HCI packet data
"""

import struct
import zlib
import sys
from collections import defaultdict

def parse_btsnooz(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    
    # Check magic
    magic = data[:8]
    print(f"Magic: {magic}")
    
    if magic == b'btsnooz\x00':
        print("Format: btsnooz (compressed)")
        version = data[8]
        last_ts = struct.unpack('>q', data[9:17])[0]
        print(f"Version: {version}, Last timestamp: {last_ts}")
        
        # Decompress
        try:
            decompressed = zlib.decompress(data[17:])
        except zlib.error:
            # Try with wbits
            try:
                decompressed = zlib.decompress(data[17:], -zlib.MAX_WBITS)
            except:
                decompressed = zlib.decompress(data[17:], zlib.MAX_WBITS | 16)
        
        print(f"Decompressed size: {len(decompressed)} bytes")
        return parse_btsnooz_records(decompressed, last_ts)
    
    elif magic == b'btsnoop\x00':
        print("Format: btsnoop (uncompressed)")
        version = struct.unpack('>I', data[8:12])[0]
        datalink = struct.unpack('>I', data[12:16])[0]
        print(f"Version: {version}, Datalink type: {datalink}")
        return parse_btsnoop_records(data[16:])
    
    else:
        print(f"Unknown format, first 32 bytes: {data[:32].hex()}")
        # Try treating entire file as compressed
        try:
            decompressed = zlib.decompress(data)
            print(f"Successfully decompressed: {len(decompressed)} bytes")
            return parse_btsnooz_records(decompressed, 0)
        except:
            print("Could not decompress. Trying raw scan...")
            return scan_raw_for_c200(data)


def parse_btsnooz_records(data, last_ts):
    """Parse btsnooz decompressed records (stored in reverse order)"""
    packets = []
    offset = 0
    
    while offset + 24 <= len(data):
        try:
            orig_len = struct.unpack('>I', data[offset:offset+4])[0]
            inc_len = struct.unpack('>I', data[offset+4:offset+8])[0]
            flags = struct.unpack('>I', data[offset+8:offset+12])[0]
            drops = struct.unpack('>I', data[offset+12:offset+16])[0]
            ts = struct.unpack('>q', data[offset+16:offset+24])[0]
            offset += 24
            
            if inc_len > 65535 or inc_len == 0:
                # Invalid, try to resync
                offset -= 23
                continue
            
            if offset + inc_len > len(data):
                break
            
            pkt_data = data[offset:offset+inc_len]
            offset += inc_len
            
            packets.append({
                'orig_len': orig_len,
                'inc_len': inc_len,
                'flags': flags,
                'drops': drops,
                'timestamp': ts,
                'data': pkt_data
            })
        except Exception as e:
            print(f"Error at offset {offset}: {e}")
            break
    
    # Reverse because btsnooz stores packets in reverse order
    packets.reverse()
    
    print(f"Parsed {len(packets)} HCI packets")
    return extract_advertising_data(packets)


def parse_btsnoop_records(data):
    """Parse standard btsnoop records"""
    packets = []
    offset = 0
    
    while offset + 24 <= len(data):
        try:
            orig_len = struct.unpack('>I', data[offset:offset+4])[0]
            inc_len = struct.unpack('>I', data[offset+4:offset+8])[0]
            flags = struct.unpack('>I', data[offset+8:offset+12])[0]
            drops = struct.unpack('>I', data[offset+12:offset+16])[0]
            ts = struct.unpack('>q', data[offset+16:offset+24])[0]
            offset += 24
            
            if inc_len > 65535 or inc_len == 0:
                break
            
            if offset + inc_len > len(data):
                break
            
            pkt_data = data[offset:offset+inc_len]
            offset += inc_len
            
            packets.append({
                'orig_len': orig_len,
                'inc_len': inc_len,
                'flags': flags,
                'drops': drops,
                'timestamp': ts,
                'data': pkt_data
            })
        except Exception as e:
            print(f"Error at offset {offset}: {e}")
            break
    
    print(f"Parsed {len(packets)} HCI packets")
    return extract_advertising_data(packets)


def extract_advertising_data(packets):
    """Extract BLE advertising data with Manufacturer ID 0xC200"""
    
    c200_packets = []
    all_adv_packets = []
    
    for i, pkt in enumerate(packets):
        data = pkt['data']
        if len(data) < 4:
            continue
        
        # HCI packet type is first byte
        pkt_type = data[0]
        
        # HCI Command packet (0x01) - LE Set Advertising Data (opcode 0x2008)
        if pkt_type == 0x01 and len(data) >= 4:
            opcode = struct.unpack('<H', data[1:3])[0]
            
            # 0x2008 = LE Set Advertising Data
            # 0x2009 = LE Set Scan Response Data  
            # 0x2036 = LE Set Extended Advertising Data
            if opcode in (0x2008, 0x2009, 0x2036):
                all_adv_packets.append({
                    'index': i,
                    'opcode': hex(opcode),
                    'timestamp': pkt['timestamp'],
                    'raw': data.hex(),
                    'data': data
                })
                
                # Search for Manufacturer Specific Data (AD type 0xFF) with Company ID 0xC200
                mfg_data = find_manufacturer_data(data, 0xC200)
                if mfg_data:
                    c200_packets.append({
                        'index': i,
                        'opcode': hex(opcode),
                        'timestamp': pkt['timestamp'],
                        'mfg_data': mfg_data,
                        'raw': data.hex()
                    })
        
        # Also check for raw advertising data patterns
        # Sometimes the structure differs, so do a byte scan
        if b'\xff\x00\xc2' in data or b'\xff\xc2\x00' in data:
            mfg_data = find_manufacturer_data_raw(data)
            if mfg_data and not any(p['index'] == i for p in c200_packets):
                c200_packets.append({
                    'index': i,
                    'opcode': 'raw_scan',
                    'timestamp': pkt['timestamp'],
                    'mfg_data': mfg_data,
                    'raw': data.hex()
                })
    
    print(f"\n{'='*70}")
    print(f"Found {len(all_adv_packets)} total advertising command packets")
    print(f"Found {len(c200_packets)} packets with Manufacturer ID 0xC200")
    print(f"{'='*70}\n")
    
    if all_adv_packets and not c200_packets:
        print("No 0xC200 packets found. Showing first 20 advertising packets for analysis:\n")
        for p in all_adv_packets[:20]:
            print(f"  Packet #{p['index']} | Opcode: {p['opcode']}")
            print(f"    Raw: {p['raw']}")
            # Try to find any manufacturer data
            find_any_manufacturer_data(p['data'])
            print()
    
    # Analyze unique commands
    if c200_packets:
        analyze_commands(c200_packets)
    
    return c200_packets


def find_manufacturer_data(hci_data, company_id):
    """Find Manufacturer Specific Data in HCI advertising data"""
    # Skip HCI header (type + opcode + param_len)
    # For 0x2008: type(1) + opcode(2) + param_total_len(1) + adv_data_len(1)
    
    data = hci_data
    
    # Search through data for AD structures
    # AD structure: length(1) + type(1) + data(length-1)
    for start in range(3, len(data) - 4):
        ad_len = data[start]
        if ad_len < 3 or start + ad_len >= len(data):
            continue
        
        ad_type = data[start + 1]
        
        # 0xFF = Manufacturer Specific Data
        if ad_type == 0xFF and start + 3 < len(data):
            # Company ID is little-endian
            cid = struct.unpack('<H', data[start+2:start+4])[0]
            if cid == company_id:
                mfg_payload = data[start+4:start+1+ad_len]
                return {
                    'company_id': hex(cid),
                    'payload': mfg_payload.hex(),
                    'payload_bytes': list(mfg_payload),
                    'length': len(mfg_payload),
                    'ad_offset': start
                }
    
    return None


def find_manufacturer_data_raw(data):
    """Brute-force search for 0xC200 manufacturer data pattern"""
    # Look for pattern: 0xFF followed by 0x00 0xC2 (little-endian 0xC200)
    for i in range(len(data) - 4):
        if data[i] == 0xFF and data[i+1] == 0x00 and data[i+2] == 0xC2:
            # Check if previous byte could be a valid AD length
            if i > 0:
                ad_len = data[i-1]
                if 3 <= ad_len <= 25:
                    payload = data[i+3:i-1+ad_len+1]  # rest of AD structure after company ID
                    return {
                        'company_id': '0xc200',
                        'payload': payload.hex(),
                        'payload_bytes': list(payload),
                        'length': len(payload),
                        'ad_offset': i-1
                    }
            # Even without valid length, extract next 16 bytes
            payload = data[i+3:i+3+16]
            if len(payload) >= 4:
                return {
                    'company_id': '0xc200',
                    'payload': payload.hex(),
                    'payload_bytes': list(payload),
                    'length': len(payload),
                    'ad_offset': i
                }
    return None


def find_any_manufacturer_data(data):
    """Find any manufacturer specific data in a packet"""
    for i in range(len(data) - 3):
        if data[i] == 0xFF and i > 0:
            ad_len = data[i-1]
            if 3 <= ad_len <= 25:
                cid = struct.unpack('<H', data[i+1:i+3])[0]
                payload = data[i+3:i-1+ad_len+1]
                print(f"    Found MFG Data: Company ID=0x{cid:04X} ({cid}), payload={payload.hex()}")


def scan_raw_for_c200(data):
    """Last resort: scan raw data for 0xC200 patterns"""
    print("\nScanning raw data for 0xC200 / 0x00C2 patterns...")
    
    findings = []
    # Little-endian: 0x00 0xC2
    for i in range(len(data) - 20):
        if data[i] == 0x00 and data[i+1] == 0xC2:
            context = data[max(0,i-5):i+20]
            findings.append({
                'offset': i,
                'context': context.hex(),
                'raw_16_after': data[i+2:i+18].hex()
            })
    
    # Big-endian: 0xC2 0x00
    for i in range(len(data) - 20):
        if data[i] == 0xC2 and data[i+1] == 0x00:
            context = data[max(0,i-5):i+20]
            findings.append({
                'offset': i,
                'context': context.hex(),
                'raw_16_after': data[i+2:i+18].hex()
            })
    
    print(f"Found {len(findings)} occurrences")
    for f in findings[:50]:
        print(f"  Offset {f['offset']}: context={f['context']} | 16 bytes after={f['raw_16_after']}")
    
    return findings


def analyze_commands(c200_packets):
    """Analyze and group unique command patterns"""
    
    unique_commands = defaultdict(list)
    
    for p in c200_packets:
        payload = p['mfg_data']['payload']
        unique_commands[payload].append(p['index'])
    
    print(f"\n{'='*70}")
    print(f"UNIQUE COMMANDS FOUND: {len(unique_commands)}")
    print(f"{'='*70}\n")
    
    # Sort by first appearance
    sorted_commands = sorted(unique_commands.items(), key=lambda x: x[1][0])
    
    for i, (payload, indices) in enumerate(sorted_commands):
        payload_bytes = bytes.fromhex(payload)
        byte_list = [f"0x{b:02X}" for b in payload_bytes]
        
        print(f"Command #{i+1}: (appeared {len(indices)}x, first at packet #{indices[0]})")
        print(f"  Hex:   {payload}")
        print(f"  Bytes: {' '.join(byte_list)}")
        print(f"  Dec:   {', '.join(str(b) for b in payload_bytes)}")
        if len(payload_bytes) >= 2:
            print(f"  Byte0={payload_bytes[0]:3d} (0x{payload_bytes[0]:02X})  Byte1={payload_bytes[1]:3d} (0x{payload_bytes[1]:02X})", end="")
            if len(payload_bytes) >= 3:
                print(f"  Byte2={payload_bytes[2]:3d} (0x{payload_bytes[2]:02X})", end="")
            if len(payload_bytes) >= 4:
                print(f"  Byte3={payload_bytes[3]:3d} (0x{payload_bytes[3]:02X})", end="")
            print()
        print(f"  Packets: {indices[:10]}{'...' if len(indices)>10 else ''}")
        print()
    
    # Try to guess command functions based on patterns
    print(f"\n{'='*70}")
    print("PATTERN ANALYSIS")
    print(f"{'='*70}\n")
    
    if sorted_commands:
        first_payload = bytes.fromhex(sorted_commands[0][0])
        print(f"Payload length: {len(first_payload)} bytes")
        
        # Check for constant bytes across all commands
        all_payloads = [bytes.fromhex(p) for p, _ in sorted_commands]
        if all_payloads:
            min_len = min(len(p) for p in all_payloads)
            print(f"\nByte-by-byte analysis (first {min_len} bytes):")
            for byte_pos in range(min_len):
                values = set(p[byte_pos] for p in all_payloads)
                if len(values) == 1:
                    print(f"  Byte[{byte_pos}] = CONSTANT 0x{list(values)[0]:02X} ({list(values)[0]})")
                else:
                    vals_str = ', '.join(f'0x{v:02X}' for v in sorted(values))
                    print(f"  Byte[{byte_pos}] = VARIABLE ({len(values)} unique values: {vals_str})")


if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else 'btsnooz_hci.log.last'
    print(f"Parsing: {filepath}")
    print(f"{'='*70}\n")
    
    results = parse_btsnooz(filepath)
    
    if not results:
        print("\n⚠️  No manufacturer data with ID 0xC200 found.")
        print("The file may not contain advertising commands, or the format may differ.")
        print("\nTry alternative: Open in Wireshark with filter:")
        print("  bthci_cmd.opcode == 0x2008")
        print("  or: btcommon.eir_ad.entry.company_id == 0xc200")
