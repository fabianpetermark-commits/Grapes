import * as THREE from 'three'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255])
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255])
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function zipStore(files) {
  const local = []
  const central = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(data)
    const header = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ])
    local.push(header, data)

    const directory = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ])
    central.push(directory)
    offset += header.length + data.length
  }

  const centralBytes = concatBytes(central)
  const localBytes = concatBytes(local)
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBytes.length), u32(localBytes.length), u16(0),
  ])
  return concatBytes([localBytes, centralBytes, end])
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function meshTo3mfObject(element, objectId) {
  const position = element.mesh.geometry.attributes.position
  const matrix = element.mesh.matrixWorld
  const vertices = []
  for (let i = 0; i < position.count; i += 1) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix)
    vertices.push(vertex)
  }

  const vertexXml = vertices
    .map((vertex) => `<vertex x="${vertex.x.toFixed(6)}" y="${vertex.y.toFixed(6)}" z="${vertex.z.toFixed(6)}"/>`)
    .join('')
  const triangleXml = []
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    triangleXml.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`)
  }

  return `<object id="${objectId}" type="model" name="${escapeXml(element.name || element.type)}"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml.join('')}</triangles></mesh></object>`
}

export function export3MF(elements) {
  const objects = elements.map((element, index) => meshTo3mfObject(element, index + 1)).join('')
  const buildItems = elements.map((element, index) => `<item objectid="${index + 1}"/>`).join('')
  const model = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter" xml:lang="hu-HU" requiredextensions=""><resources>${objects}</resources><build>${buildItems}</build></model>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`

  return new Blob([zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: '3D/_rels/3dmodel.model.rels', data: relationships },
    { name: '3D/3dmodel.model', data: model },
  ])], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' })
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function unzipStore(buffer) {
  const bytes = new Uint8Array(buffer)
  const files = new Map()
  let offset = 0

  while (offset + 4 <= bytes.length) {
    const signature = readU32(bytes, offset)
    if (signature === 0x04034b50) {
      const method = readU16(bytes, offset + 8)
      const compressedSize = readU32(bytes, offset + 18)
      const nameLength = readU16(bytes, offset + 26)
      const extraLength = readU16(bytes, offset + 28)
      const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength))
      const dataStart = offset + 30 + nameLength + extraLength
      if (method !== 0) throw new Error('A 3MF tömörített ZIP-bejegyzése nem támogatott ebben a verzióban.')
      files.set(name, bytes.slice(dataStart, dataStart + compressedSize))
      offset = dataStart + compressedSize
    } else if (signature === 0x02014b50 || signature === 0x06054b50) {
      break
    } else {
      throw new Error('Érvénytelen 3MF ZIP szerkezet.')
    }
  }
  return files
}

function parse3mfModel(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('A 3MF modell XML-je nem olvasható.')
  const objects = [...xml.querySelectorAll('object')]
  const states = []

  for (const object of objects) {
    const vertices = [...object.querySelectorAll('mesh > vertices > vertex')]
    const triangles = [...object.querySelectorAll('mesh > triangles > triangle')]
    if (!vertices.length || !triangles.length) continue

    const positions = new Float32Array(triangles.length * 9)
    let cursor = 0
    for (const triangle of triangles) {
      for (const key of ['v1', 'v2', 'v3']) {
        const vertex = vertices[Number(triangle.getAttribute(key))]
        if (!vertex) throw new Error('A 3MF háromszöge érvénytelen csúcsra hivatkozik.')
        positions[cursor++] = Number(vertex.getAttribute('x'))
        positions[cursor++] = Number(vertex.getAttribute('y'))
        positions[cursor++] = Number(vertex.getAttribute('z'))
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    const center = geometry.boundingBox.getCenter(new THREE.Vector3())
    geometry.translate(-center.x, -center.y, -center.z)

    states.push({
      name: object.getAttribute('name') || '3MF modell',
      geometry,
      baseDimensions: { x: size.x, y: size.y, z: size.z },
      position: { x: center.x, y: center.y, z: center.z },
    })
  }

  return states
}

export async function import3MF(file) {
  const buffer = await file.arrayBuffer()
  const files = unzipStore(buffer)
  const model = files.get('3D/3dmodel.model')
  if (!model) throw new Error('A 3MF fájl nem tartalmaz 3D/3dmodel.model fájlt.')
  return parse3mfModel(decoder.decode(model))
}
