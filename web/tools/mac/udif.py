#!/usr/bin/env python3
"""Wrap a raw disk image (here: an ISO 9660 + Rock Ridge image from genisoimage) into a
compressed UDIF .dmg (UDZO, zlib) that macOS mounts with a double click.

Format: zlib chunks of 1 MiB uncompressed each, one 'mish' block table describing them
in the XML resource fork (blkx), and the 512-byte 'koly' trailer. CRC32 checksums
everywhere, like hdiutil writes them.

usage: udif.py input.img output.dmg [volume name]
"""
import plistlib, struct, sys, uuid, zlib

SECTOR = 512
CHUNK = 2048 * SECTOR          # 1 MiB of raw data per compressed chunk
ZLIB, ZERO, COMMENT, END = 0x80000005, 0x00000002, 0x7FFFFFFE, 0xFFFFFFFF


def crc_block(value):
    # checksum structure: type (2 = CRC32), bit size, 32 x uint32
    return struct.pack('>II', 2, 32) + struct.pack('>I', value) + b'\0' * 124


def main(src, dst, name='disk image'):
    raw = open(src, 'rb').read()
    if len(raw) % SECTOR:
        raw += b'\0' * (SECTOR - len(raw) % SECTOR)
    sectors = len(raw) // SECTOR
    chunks, data, data_crc, raw_crc = [], bytearray(), 0, 0
    for off in range(0, len(raw), CHUNK):
        block = raw[off:off + CHUNK]
        raw_crc = zlib.crc32(block, raw_crc)
        n = len(block) // SECTOR
        if block.count(0) == len(block):
            chunks.append((ZERO, off // SECTOR, n, len(data), 0))
            continue
        comp = zlib.compress(block, 9)
        chunks.append((ZLIB, off // SECTOR, n, len(data), len(comp)))
        data += comp
        data_crc = zlib.crc32(comp, data_crc)
    chunks.append((END, sectors, 0, len(data), 0))

    mish = struct.pack('>4sIQQQII', b'mish', 1, 0, sectors, 0, 0x208, 2) + b'\0' * 24
    mish += crc_block(raw_crc)
    mish += struct.pack('>I', len(chunks))
    for typ, first, count, coff, clen in chunks:
        mish += struct.pack('>IIQQQQ', typ, 0, first, count, coff, clen)

    plist = {'resource-fork': {'blkx': [{
        'Attributes': '0x0050', 'CFName': f'whole disk ({name} : 0)', 'Data': mish, 'ID': '0',
        'Name': f'whole disk ({name} : 0)'}]}}
    xml = plistlib.dumps(plist, fmt=plistlib.FMT_XML)
    xml_off = len(data)
    master = zlib.crc32(struct.pack('>I', raw_crc))

    koly = struct.pack('>4sIIIQQQQQII16s', b'koly', 4, 512, 1, 0, 0, len(data), 0, 0, 1, 1, uuid.uuid4().bytes)
    koly += crc_block(data_crc)
    koly += struct.pack('>QQ', xml_off, len(xml)) + b'\0' * 120
    koly += crc_block(master)
    koly += struct.pack('>IQ', 1, sectors) + b'\0' * 12
    assert len(koly) == 512, len(koly)

    with open(dst, 'wb') as f:
        f.write(data); f.write(xml); f.write(koly)
    print(f'{dst}: {len(raw) / 1e6:.1f} MB raw -> {(len(data) + len(xml) + 512) / 1e6:.1f} MB')


if __name__ == '__main__':
    main(*sys.argv[1:])
