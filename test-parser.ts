import { parseArtifact } from './server/engines/intake-spine/parsing-substrate';

const textContent = Buffer.from('On January 15, 2025, John Smith was terminated from Acme Corp.\nHis landlord, Jane Doe, served an eviction notice on February 1, 2025.\nThe Department of Labor was contacted on February 10, 2025.');

async function main() {
  const result = await parseArtifact('test_artifact_001', textContent, 'text/plain');
  console.log('=== TEXT PARSING ===');
  console.log('Status:', result.extraction_status);
  console.log('SHA256:', result.raw_bytes_sha256);
  console.log('Byte size:', result.byte_size);
  console.log('Spans count:', result.spans.length);
  console.log('Parser version:', result.parser_version);
  for (const span of result.spans) {
    console.log(`  [${span.start_offset}-${span.end_offset}] "${span.text.substring(0, 80)}"`);
  }

  // Test determinism
  const result2 = await parseArtifact('test_artifact_001', textContent, 'text/plain');
  console.log('\n=== DETERMINISM ===');
  console.log('SHA match:', result.raw_bytes_sha256 === result2.raw_bytes_sha256);
  console.log('Text match:', result.extracted_text === result2.extracted_text);
  console.log('Spans match:', JSON.stringify(result.spans) === JSON.stringify(result2.spans));

  // Test unsupported
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const result3 = await parseArtifact('test_jpeg', jpeg, 'image/jpeg');
  console.log('\n=== UNSUPPORTED ===');
  console.log('Status:', result3.extraction_status);
}

main().catch(console.error);
