import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const shekels = (value) => `₪${value.toFixed(2)}`;

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function printReport({ items, comparison, city, chainResults }) {
  const { rows, winner, savings, sharedIndexes } = comparison;

  console.log('');
  console.log('════════ השוואת סל קניות ════════');
  console.log(
    `רשימה: ${items.length} פריטים | עיר: ${city} | סל משותף: ${sharedIndexes.length} פריטים`,
  );
  console.log('');

  console.log(
    `  ${pad('רשת', 14)}${pad('סל משותף', 14)}${pad('סל מלא', 14)}${pad('נמצאו', 8)}`,
  );
  console.log(`  ${'─'.repeat(13)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(6)}`);

  for (const row of rows) {
    const marker = winner && row.key === winner.key ? '► ' : '  ';
    if (!row.ok) {
      console.log(`${marker}${pad(row.displayName, 14)}${pad('— נכשלה —', 28)}${pad('—', 8)}`);
      continue;
    }
    console.log(
      `${marker}${pad(row.displayName, 14)}${pad(shekels(row.sharedTotal), 14)}` +
        `${pad(shekels(row.fullTotal), 14)}${pad(`${row.foundCount}/${row.itemCount}`, 8)}`,
    );
  }

  console.log('');
  if (winner) {
    const suffix = savings > 0 ? ` — חיסכון ${shekels(savings)} מול הבאה בתור` : '';
    console.log(`► הזול ביותר (לפי הסל המשותף): ${winner.displayName}${suffix}`);
    console.log(`   סניף: ${winner.storeName || winner.storeId}`);
  } else {
    console.log('לא הצלחנו להשיג מחירים משום רשת.');
  }

  const failures = rows.filter((row) => !row.ok);
  if (failures.length > 0) {
    console.log('');
    console.log('רשתות שנכשלו:');
    for (const failure of failures) {
      console.log(`  • ${failure.displayName}: ${failure.error}`);
    }
  }

  printItemBreakdown(items, chainResults);
}

function printItemBreakdown(items, chainResults) {
  const succeeded = chainResults.filter((result) => result.ok);
  if (succeeded.length === 0) return;

  console.log('');
  console.log('──────── פירוט פריטים ────────');

  const missing = [];

  for (const [index, item] of items.entries()) {
    console.log('');
    console.log(`• ${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`);

    for (const result of succeeded) {
      const match = result.matches[index];
      if (!match) {
        console.log(`    ${pad(result.displayName, 12)} לא נמצא`);
        missing.push({ item: item.name, chain: result.displayName });
        continue;
      }
      console.log(
        `    ${pad(result.displayName, 12)}${pad(shekels(match.product.price), 11)}` +
          `${match.product.name}  (התאמה ${match.score})`,
      );
    }
  }

  if (missing.length > 0) {
    console.log('');
    console.log('פריטים שלא נמצאו:');
    for (const entry of missing) {
      console.log(`  • ${entry.item} — ${entry.chain}`);
    }
  }
  console.log('');
}

/** Writes the results contract to an explicit file path, creating its folder. */
export async function writeResults(outputPath, payload) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return outputPath;
}
