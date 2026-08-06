function cleanGedcomValue(value = '') {
  return String(value).trim();
}

function normalizeName(value = '') {
  const raw = cleanGedcomValue(value);
  const display = raw.replace(/\//g, '').replace(/\s+/g, ' ').trim();
  const surnameMatch = raw.match(/\/([^/]+)\//);

  return {
    raw,
    display,
    surname: surnameMatch ? surnameMatch[1].trim() : '',
    given: surnameMatch ? raw.slice(0, surnameMatch.index).trim() : display,
  };
}

function parseLine(line) {
  const match = String(line).match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Z0-9_]+)(?:\s+(.*))?$/i);
  if (!match) return null;

  return {
    level: Number(match[1]),
    xref: match[2] || null,
    tag: match[3].toUpperCase(),
    value: cleanGedcomValue(match[4] || ''),
  };
}

function ensurePerson(peopleById, id) {
  if (!peopleById.has(id)) {
    peopleById.set(id, {
      id,
      name: null,
      sex: null,
      birth: {},
      death: {},
      notes: [],
      familyAsChild: [],
      familyAsSpouse: [],
    });
  }

  return peopleById.get(id);
}

function ensureSubmitter(submittersById, id) {
  if (!submittersById.has(id)) {
    submittersById.set(id, {
      id,
      name: '',
      address: '',
      phone: '',
      email: '',
      notes: [],
    });
  }

  return submittersById.get(id);
}

function ensureFamily(familiesById, id) {
  if (!familiesById.has(id)) {
    familiesById.set(id, {
      id,
      husbandId: null,
      wifeId: null,
      childrenIds: [],
      marriage: {},
      divorce: {},
      notes: [],
    });
  }

  return familiesById.get(id);
}

function setEventValue(target, eventTag, childTag, value) {
  const eventNameByTag = {
    BIRT: 'birth',
    DEAT: 'death',
    MARR: 'marriage',
    DIV: 'divorce',
  };

  const eventName = eventNameByTag[eventTag];
  if (!eventName) return;

  target[eventName] = target[eventName] || {};

  if (childTag === 'DATE') target[eventName].date = value;
  if (childTag === 'PLAC') target[eventName].place = value;
}

function parseGedcom(gedcomText) {
  if (!gedcomText || typeof gedcomText !== 'string') {
    throw new Error('GEDCOM text is required. Send it as { "gedcom": "..." } or raw text.');
  }

  const peopleById = new Map();
  const familiesById = new Map();
  const submittersById = new Map();
  const metadata = {
    header: {
      source: {},
      gedcom: {},
      destination: '',
      date: '',
      file: '',
      characterSet: '',
      submitterId: '',
    },
    submitters: [],
  };
  const warnings = [];
  const lines = gedcomText.replace(/^\uFEFF/, '').split(/\r?\n/);

  let currentRecord = null;
  let currentEventTag = null;
  let currentHeaderSection = null;
  let currentTextTarget = null;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const parsed = parseLine(lines[lineNumber]);
    if (!parsed) {
      if (lines[lineNumber].trim()) {
        warnings.push({ line: lineNumber + 1, message: 'Skipped unrecognized GEDCOM line.' });
      }
      continue;
    }

    const { level, xref, tag, value } = parsed;

    if (level === 0) {
      currentEventTag = null;
      currentHeaderSection = null;
      currentTextTarget = null;

      if (tag === 'HEAD') {
        currentRecord = { type: 'HEAD', data: metadata.header };
      } else if (xref && tag === 'SUBM') {
        currentRecord = { type: 'SUBM', data: ensureSubmitter(submittersById, xref) };
      } else if (xref && tag === 'INDI') {
        currentRecord = { type: 'INDI', data: ensurePerson(peopleById, xref) };
      } else if (xref && tag === 'FAM') {
        currentRecord = { type: 'FAM', data: ensureFamily(familiesById, xref) };
      } else {
        currentRecord = null;
      }
      continue;
    }

    if (!currentRecord) continue;

    if (tag === 'CONT' || tag === 'CONC') {
      if (currentTextTarget) {
        const currentValue = currentTextTarget.object[currentTextTarget.key];
        const separator = tag === 'CONT' && currentValue ? '\n' : '';
        currentTextTarget.object[currentTextTarget.key] += `${separator}${value}`;
      }
      continue;
    }

    if (level === 1) {
      currentEventTag = null;
      currentHeaderSection = null;
      currentTextTarget = null;

      if (currentRecord.type === 'HEAD') {
        const header = currentRecord.data;

        if (tag === 'SOUR') {
          header.source.name = value;
          currentHeaderSection = 'SOUR';
        }
        if (tag === 'GEDC') currentHeaderSection = 'GEDC';
        if (tag === 'DEST') header.destination = value;
        if (tag === 'DATE') header.date = value;
        if (tag === 'FILE') header.file = value;
        if (tag === 'CHAR') header.characterSet = value;
        if (tag === 'SUBM') header.submitterId = value;
      }

      if (currentRecord.type === 'SUBM') {
        const submitter = currentRecord.data;

        if (tag === 'NAME') submitter.name = value;
        if (tag === 'ADDR') {
          submitter.address = value;
          currentTextTarget = { object: submitter, key: 'address' };
        }
        if (tag === 'PHON') submitter.phone = value;
        if (tag === 'EMAIL') submitter.email = value;
        if (tag === 'NOTE') {
          submitter.notes.push(value);
          currentTextTarget = { object: submitter.notes, key: submitter.notes.length - 1 };
        }
      }

      if (currentRecord.type === 'INDI') {
        const person = currentRecord.data;

        if (tag === 'NAME') person.name = normalizeName(value);
        if (tag === 'SEX') person.sex = value || null;
        if (tag === 'FAMC' && value) person.familyAsChild.push(value);
        if (tag === 'FAMS' && value) person.familyAsSpouse.push(value);
        if (tag === 'NOTE') {
          person.notes.push(value);
          currentTextTarget = { object: person.notes, key: person.notes.length - 1 };
        }
        if (tag === 'BIRT' || tag === 'DEAT') currentEventTag = tag;
      }

      if (currentRecord.type === 'FAM') {
        const family = currentRecord.data;

        if (tag === 'HUSB') family.husbandId = value || null;
        if (tag === 'WIFE') family.wifeId = value || null;
        if (tag === 'CHIL' && value) family.childrenIds.push(value);
        if (tag === 'NOTE') {
          family.notes.push(value);
          currentTextTarget = { object: family.notes, key: family.notes.length - 1 };
        }
        if (tag === 'MARR' || tag === 'DIV') currentEventTag = tag;
      }

      continue;
    }

    if (level === 2 && currentRecord.type === 'HEAD' && currentHeaderSection === 'GEDC') {
      if (tag === 'VERS') currentRecord.data.gedcom.version = value;
      if (tag === 'FORM') currentRecord.data.gedcom.form = value;
      continue;
    }

    if (level === 2 && currentRecord.type === 'HEAD' && currentHeaderSection === 'SOUR') {
      if (tag === 'VERS') currentRecord.data.source.version = value;
      if (tag === 'NAME') currentRecord.data.source.productName = value;
      if (tag === 'CORP') currentRecord.data.source.corporation = value;
      continue;
    }

    if (level === 2 && currentEventTag && (tag === 'DATE' || tag === 'PLAC')) {
      setEventValue(currentRecord.data, currentEventTag, tag, value);
    }
  }

  const people = Array.from(peopleById.values());
  const families = Array.from(familiesById.values());
  metadata.submitters = Array.from(submittersById.values());
  const relationships = [];

  for (const family of families) {
    const spouseIds = [family.husbandId, family.wifeId].filter(Boolean);

    if (spouseIds.length === 2) {
      relationships.push({ type: 'spouse', personId: spouseIds[0], relatedPersonId: spouseIds[1], familyId: family.id });
    }

    for (const childId of family.childrenIds) {
      for (const parentId of spouseIds) {
        relationships.push({ type: 'parent-child', personId: parentId, relatedPersonId: childId, familyId: family.id });
      }
    }
  }

  return {
    metadata,
    people,
    families,
    relationships,
    stats: {
      people: people.length,
      families: families.length,
      relationships: relationships.length,
      lines: lines.length,
    },
    warnings,
  };
}

module.exports = { parseGedcom };
