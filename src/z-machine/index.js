/* eslint-disable no-bitwise */

const OFFSET_HEADER_VERSION = 0x00;
const OFFSET_HEADER_PC = 0x06;
const OFFSET_HEADER_DICTIONARY = 0x08;
const OFFSET_HEADER_OBJECT_TABLE = 0x0A;
const OFFSET_HEADER_GLOBAL_VARIABLES = 0x0C;
const OFFSET_HEADER_ABBREVIATION_TABLE = 0x18;
const OFFSET_HEADER_FILE_SIZE = 0x1A;
const OFFSET_HEADER_FILE_CHECKSUM = 0x1C;

const OFFSET_DICTIONARY_WORD_SEPARATOR_COUNT = 0;
const OFFSET_DICTIONARY_WORD_SEPARATORS = 1;

const COUNT_OBJECT_DEFAULT_PROPERTIES = 31;

const SIZE_OBJECT_DEFAULT_PROPERTY = 2;
const SIZE_OBJECT_ENTRY = 9;

const OFFSET_OBJECT_ATTRIBUTES = 0;
const OFFSET_OBJECT_PARENT = 4;
const OFFSET_OBJECT_SIBLING = 5;
const OFFSET_OBJECT_CHILD = 6;
const OFFSET_OBJECT_PROPERTIES_POINTER = 7;
const OFFSET_OBJECT_NAME = 1;

const TYPE_LARGE_CONSTANT = 0;
const TYPE_SMALL_CONSTANT = 1;
const TYPE_VARIABLE = 2;

const Z_MACHINE_FALSE = 0;
const Z_MACHINE_TRUE = 1;

const VARIABLE_STACK = 0;

const ALPHABET_LOWER = 0;
const ALPHABET_UPPER = 1;
const ALPHABET_PUNCTUATION = 2;

const ALPHABET_TABLE_V1 = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ' 0123456789.,!?_#\'"/\\<-:()',
];

const ALPHABET_TABLE_V2 = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ' \n0123456789.,!?_#\'"/\\-:()',
];

const ESCAPE_SPACE = 0;
const ESCAPE_NEW_LINE = 1;
const ESCAPE_SHIFT_UP = 2;
const ESCAPE_SHIFT_DOWN = 3;
const ESCAPE_SHIFT_LOCK_UP = 4;
const ESCAPE_SHIFT_LOCK_DOWN = 5;

const PUNCTUATION_ESCAPE = 6;

const CODE_SPACE = ' '.charCodeAt(0);
const CODE_NEWLINE = '\n'.codePointAt(0);

function signExtend16(v) {
  return ((v & 0xFFFF) ^ 0x8000) - 0x8000;
}

module.exports = function runStory({
  buffer,
  stdout,
  stderr,
  readlineSync,
}) {
  const view = new DataView(buffer);

  function readByte(address) {
    return view.getUint8(address);
  }

  function readWord(address) {
    return view.getUint16(address, false);
  }

  function writeByte(address, value) {
    view.setUint8(address, value);
  }

  function writeWord(address, value) {
    view.setUint16(address, value, false);
  }

  function computeChecksum(start, end) {
    let checksum = 0;
    for (let address = start; address < end; address += 1) {
      checksum += readByte(address);
    }
    return checksum & 0xFFFF;
  }

  const version = readByte(OFFSET_HEADER_VERSION);
  if (version > 3) {
    return;
  }

  const initialPc = readWord(OFFSET_HEADER_PC);
  const offsetDictionary = readWord(OFFSET_HEADER_DICTIONARY);
  const offsetObjectTable = readWord(OFFSET_HEADER_OBJECT_TABLE);
  const offsetGlobals = readWord(OFFSET_HEADER_GLOBAL_VARIABLES);
  const offsetAbbreviationTable = readWord(OFFSET_HEADER_ABBREVIATION_TABLE);
  const headerFileSize = readWord(OFFSET_HEADER_FILE_SIZE);
  const headerFileChecksum = readWord(OFFSET_HEADER_FILE_CHECKSUM);
  const fileChecksum = computeChecksum(0x40, 2 * headerFileSize);

  function getUnpackedAddress(address) {
    return 2 * address;
  }

  function getGlobalVariableAddress(variable) {
    return offsetGlobals + 2 * (variable - 0x10);
  }

  function getAbbreviationAddress(abbreviation) {
    return 2 * readWord(offsetAbbreviationTable + 2 * abbreviation);
  }

  // Machine definition
  const machine = {
    running: true,
    pc: initialPc,
    stackFrames: [],
  };

  function readRunning() {
    return machine.running;
  }

  function writeRunning(value) {
    machine.running = value;
  }

  function error(message) {
    stderr.write(`\n${message}\n`);
    writeRunning(false);
  }

  function unimplemented(feature) {
    error(`unimplemented feature: ${feature}`);
  }

  function readPC() {
    return machine.pc;
  }

  function writePC(value) {
    if (value === 0) {
      error('attempted to write zero to the program counter');
      return;
    }
    machine.pc = value;
  }

  function pushStackFrame(returnAddress, variable, locals) {
    machine.stackFrames.push({
      returnAddress,
      variable,
      locals,
      evaluations: [],
    });
  }

  function popStackFrame() {
    return machine.stackFrames.pop();
  }

  function peekStackFrame() {
    return machine.stackFrames[machine.stackFrames.length - 1];
  }

  function pushEvaluation(value) {
    peekStackFrame().evaluations.push(value);
  }

  function popEvaluation() {
    return peekStackFrame().evaluations.pop();
  }

  function readLocal(variable) {
    return peekStackFrame().locals[variable - 1];
  }

  function writeLocal(variable, value) {
    peekStackFrame().locals[variable - 1] = value;
  }

  function readGlobal(variable) {
    return readWord(getGlobalVariableAddress(variable));
  }

  function writeGlobal(variable, value) {
    return writeWord(getGlobalVariableAddress(variable), value);
  }

  function readVariable(variable) {
    const clampedVariable = variable & 0xFF;
    if (clampedVariable === 0) {
      return popEvaluation();
    } if (clampedVariable < 0x10) {
      return readLocal(clampedVariable);
    }
    return readGlobal(clampedVariable);
  }

  function writeVariable(variable, value) {
    const clampedVariable = variable & 0xFF;
    const clampedValue = value & 0xFFFF;
    if (clampedVariable === 0) {
      pushEvaluation(clampedValue);
    } else if (clampedVariable < 0x10) {
      writeLocal(clampedVariable, clampedValue);
    } else {
      writeGlobal(clampedVariable, clampedValue);
    }
  }

  // Instruction stream
  function readInstructionByte() {
    const pc = readPC();
    const b = readByte(pc);
    writePC(pc + 1);
    return b;
  }

  function readInstructionWord() {
    const pc = readPC();
    const w = readWord(pc);
    writePC(pc + 2);
    return w;
  }

  function readInstructionOperands(operandTypes) {
    const operands = [];
    for (let i = 0; i < 4; i += 1) {
      const shift = 6 - 2 * i;
      const operandType = (operandTypes >> shift) & 0x3;
      if (operandType === TYPE_LARGE_CONSTANT) {
        operands.push(readInstructionWord());
      } else if (operandType === TYPE_SMALL_CONSTANT) {
        operands.push(readInstructionByte());
      } else if (operandType === TYPE_VARIABLE) {
        const variable = readInstructionByte();
        operands.push(readVariable(variable));
      } else {
        break;
      }
    }
    return operands;
  }

  function readInstructionBranch() {
    const far = readInstructionByte();
    const negate = (far & 0x80) === 0;
    if ((far & 0x40) === 0) {
      const near = readInstructionByte();
      const unsignedOffset = ((far & 0x3F) << 8) + near;
      const offset = (unsignedOffset ^ 0x2000) - 0x2000;
      return { negate, offset };
    }
    const offset = far & 0x3F;
    return { negate, offset };
  }

  // Dictionary
  function getDictionaryWordSeparatorCountAddress() {
    return offsetDictionary + OFFSET_DICTIONARY_WORD_SEPARATOR_COUNT;
  }

  function getDictionaryWordSeparatorsAddress() {
    return offsetDictionary + OFFSET_DICTIONARY_WORD_SEPARATORS;
  }

  function readDictionaryWordSeparatorCount() {
    return readByte(getDictionaryWordSeparatorCountAddress());
  }

  function getDictionaryEntryLengthAddress() {
    const address = getDictionaryWordSeparatorsAddress();
    const separatorCount = readDictionaryWordSeparatorCount();
    return address + separatorCount;
  }

  function getDictionaryNumberOfEntriesAddress() {
    return getDictionaryEntryLengthAddress() + 1;
  }

  function getDictionaryEntriesAddress() {
    return getDictionaryNumberOfEntriesAddress() + 2;
  }

  function readDictionaryWordSeparators() {
    const count = readDictionaryWordSeparatorCount();
    let address = getDictionaryWordSeparatorsAddress();
    const separators = [];
    for (let i = 0; i < count; i += 1) {
      const code = readByte(address);
      address += 1;
      separators.push(String.fromCharCode(code));
    }
    return separators;
  }

  function readDictionaryEntryLength() {
    return readByte(getDictionaryEntryLengthAddress());
  }

  function readDictionaryNumberOfEntries() {
    return readWord(getDictionaryNumberOfEntriesAddress());
  }

  function testDictionaryEntry(entryAddress, words) {
    let address = entryAddress;
    for (let i = 0; i < words.length; i += 1) {
      if (readWord(address) !== words[i]) {
        return false;
      }
      address += 2;
    }
    return true;
  }

  function findDictionaryEntry(words) {
    const count = readDictionaryNumberOfEntries();
    const entryLength = readDictionaryEntryLength();
    let address = getDictionaryEntriesAddress();
    for (let i = 0; i < count; i += 1) {
      if (testDictionaryEntry(address, words)) {
        return address;
      }
      address += entryLength;
    }
    return 0;
  }

  // Objects
  function getDefaultPropertyAddress(property) {
    return offsetObjectTable + (property - 1) * SIZE_OBJECT_DEFAULT_PROPERTY;
  }

  function getObjectEntryAddress(object) {
    return offsetObjectTable
            + (COUNT_OBJECT_DEFAULT_PROPERTIES * SIZE_OBJECT_DEFAULT_PROPERTY)
            + SIZE_OBJECT_ENTRY * (object - 1);
  }

  function getObjectAttributeAddress(object, attribute) {
    const objectEntryAddress = getObjectEntryAddress(object);
    const attributeByte = (attribute >> 3) & 0x3;
    return objectEntryAddress + OFFSET_OBJECT_ATTRIBUTES + attributeByte;
  }

  function getObjectAttributeBit(attribute) {
    return (attribute ^ 0x7) & 0x7;
  }

  function getObjectParentAddress(object) {
    return getObjectEntryAddress(object) + OFFSET_OBJECT_PARENT;
  }

  function getObjectSiblingAddress(object) {
    return getObjectEntryAddress(object) + OFFSET_OBJECT_SIBLING;
  }

  function getObjectChildAddress(object) {
    return getObjectEntryAddress(object) + OFFSET_OBJECT_CHILD;
  }

  function getObjectPropertyPointerAddress(object) {
    return getObjectEntryAddress(object) + OFFSET_OBJECT_PROPERTIES_POINTER;
  }

  function getObjectPropertiesHeaderAddress(object) {
    return readWord(getObjectPropertyPointerAddress(object));
  }

  function getObjectNameAddress(object) {
    return getObjectPropertiesHeaderAddress(object) + OFFSET_OBJECT_NAME;
  }

  function getObjectPropertiesAddress(object) {
    const objectPropertiesHeaderAddress = getObjectPropertiesHeaderAddress(object);
    const nameLength = 2 * readByte(objectPropertiesHeaderAddress);
    return objectPropertiesHeaderAddress + OFFSET_OBJECT_NAME + nameLength;
  }

  function readObjectAttribute(object, attribute) {
    const attributeAddress = getObjectAttributeAddress(object, attribute);
    const bit = getObjectAttributeBit(attribute);
    const attributes = readByte(attributeAddress);
    return (attributes >> bit) & 0x1;
  }

  function writeObjectAttribute(object, attribute, value) {
    const attributeAddress = getObjectAttributeAddress(object, attribute);
    const bit = getObjectAttributeBit(attribute);
    const attributes = readByte(attributeAddress);
    const updated = (attributes & ~(0x1 << bit)) | ((value & 0x1) << bit);
    writeByte(attributeAddress, updated);
  }

  function readObjectParent(object) {
    return readByte(getObjectParentAddress(object));
  }

  function writeObjectParent(object, value) {
    writeByte(getObjectParentAddress(object), value);
  }

  function readObjectSibling(object) {
    return readByte(getObjectSiblingAddress(object));
  }

  function writeObjectSibling(object, value) {
    return writeByte(getObjectSiblingAddress(object), value);
  }

  function readObjectChild(object) {
    return readByte(getObjectChildAddress(object));
  }

  function writeObjectChild(object, value) {
    return writeByte(getObjectChildAddress(object), value);
  }

  function readObjectPropertyNumberAndSize(address) {
    const data = readByte(address);
    return {
      number: data & 0x1F,
      size: 1 + (data >> 5),
    };
  }

  function findObjectPropertySizeAndAddress(object, property) {
    let address = getObjectPropertiesAddress(object);
    for (let i = 0; i < 32; i += 1) {
      const { number, size } = readObjectPropertyNumberAndSize(address);
      address += 1;
      if (number === 0) {
        return { size: 0, address: 0 };
      } if (number === property) {
        return { size, address };
      }
      address += size;
    }
    return { size: 0, address: 0 };
  }

  function findObjectNextPropertyNumber(object, property) {
    if (property === 0) {
      const address = getObjectPropertiesAddress(object);
      const { number } = readObjectPropertyNumberAndSize(address);
      return number;
    }
    const { size, address } = findObjectPropertySizeAndAddress(object, property);
    if (address === 0) {
      error(`Property ${property} not found on object ${object}`);
      return 0;
    }
    const { number } = readObjectPropertyNumberAndSize(address + size);
    return number;
  }

  function readObjectProperty(object, property) {
    const { size, address } = findObjectPropertySizeAndAddress(object, property);
    if (address === 0) {
      return readWord(getDefaultPropertyAddress(property));
    } if (size === 1) {
      return readByte(address);
    }
    return readWord(address);
  }

  function writeObjectProperty(object, property, value) {
    const { size, address } = findObjectPropertySizeAndAddress(object, property);
    if (address === 0) {
      error(`Property ${property} not found on object ${object}`);
    } else if (size === 1) {
      writeByte(address, value);
    } else {
      writeWord(address, value);
    }
  }

  function removeObject(object) {
    const parent = readObjectParent(object);
    if (parent === 0) {
      return;
    }
    const sibling = readObjectSibling(object);
    let previous = readObjectChild(parent);
    if (previous === object) {
      writeObjectChild(parent, sibling);
    } else {
      while (readObjectSibling(previous) !== object) {
        previous = readObjectSibling(previous);
      }
      writeObjectSibling(previous, sibling);
    }
    writeObjectParent(object, 0);
    writeObjectSibling(object, 0);
  }

  function insertObject(object, destination) {
    removeObject(object);
    writeObjectParent(object, destination);
    writeObjectSibling(object, readObjectChild(destination));
    writeObjectChild(destination, object);
  }

  // String encoding
  function splitString(input, separators) {
    const words = [];

    function pushWord(word, start) {
      if (word.length !== 0) {
        words.push({
          word,
          length: word.length,
          start,
        });
      }
    }

    let word = [];
    let start = 0;
    for (let i = 0; i < input.length; i += 1) {
      const c = input[i];
      if (c === ' ' || c === '\0') {
        pushWord(word, start);
        word = [];
        start = i + 1;
      } else if (separators.includes(c)) {
        pushWord(word, start);
        pushWord([c], i);
        word = [];
        start = i + 1;
      } else {
        word.push(c);
      }
    }
    return words;
  }

  function encodeCharacter(c, symbolAlphabet) {
    const encoded = [];
    if (c === ' ') {
      encoded.push(ESCAPE_SPACE);
    } else if (c >= 'a' && c <= 'z') {
      encoded.push(6 + c.charCodeAt(0) - 'a'.charCodeAt(0));
    } else if (c >= 'A' && c <= 'Z') {
      encoded.push(ESCAPE_SHIFT_LOCK_UP);
      encoded.push(6 + c.charCodeAt(0) - 'A'.charCodeAt(0));
    } else {
      encoded.push(ESCAPE_SHIFT_LOCK_DOWN);
      const index = symbolAlphabet[ALPHABET_PUNCTUATION].indexOf(c);
      if (index > -1) {
        encoded.push(6 + index);
      } else {
        const code = c.charCodeAt(0);
        encoded.push(6 + PUNCTUATION_ESCAPE);
        encoded.push((code >> 5) & 0x1F);
        encoded.push(code & 0x1F);
      }
    }
    return encoded;
  }

  function encodeString(text, length, symbolAlphabet) {
    const encoded = [];
    for (let i = 0; i < length; i += 1) {
      if (i < text.length) {
        encoded.push(...encodeCharacter(text[i], symbolAlphabet));
      } else {
        encoded.push(ESCAPE_SHIFT_LOCK_DOWN);
      }
    }
    return encoded.slice(0, length);
  }

  function packString(encodedString) {
    const packed = [];
    for (let i = 0; i < encodedString.length; i += 3) {
      packed.push((encodedString[i] << 10)
        + (encodedString[i + 1] << 5)
        + (encodedString[i + 2]));
    }
    packed[packed.length - 1] |= 0x8000;
    return packed;
  }

  function tokenizeString(text) {
    const alphabetTable = (version < 2) ? ALPHABET_TABLE_V1 : ALPHABET_TABLE_V2;
    const symbolAlphabet = alphabetTable[ALPHABET_PUNCTUATION];

    const separators = readDictionaryWordSeparators();
    const words = splitString(text, separators);
    return words.map(({
      word,
      length,
      start,
    }) => ({
      word: (() => {
        const encoded = encodeString(word, 6, symbolAlphabet);
        const packed = packString(encoded);
        return findDictionaryEntry(packed);
      })(),
      length,
      start: 1 + start,
    }));
  }

  // String printing
  function printCharacter(character) {
    // TODO map from ZSCII
    stdout.write(String.fromCharCode(character));
  }

  function printNumber(number) {
    stdout.write(number.toString());
  }

  function printString(address, abbreviation = false) {
    const DECODE_STATE_NORMAL = 0;
    const DECODE_STATE_ABBREVIATION = 1;
    const DECODE_STATE_ZSCII_HIGH = 2;
    const DECODE_STATE_ZSCII_LOW = 3;

    function shiftUp(a) {
      return (a + 1) % 3;
    }

    function shiftDown(a) {
      return (a + 2) % 3;
    }

    function isZsciiEscape(alphabet, character) {
      return alphabet === ALPHABET_PUNCTUATION && character === PUNCTUATION_ESCAPE;
    }

    const alphabetTable = (version < 2) ? ALPHABET_TABLE_V1 : ALPHABET_TABLE_V2;

    let alphabetPrevious = ALPHABET_LOWER;
    let alphabetCurrent = ALPHABET_LOWER;
    let state = DECODE_STATE_NORMAL;
    let intermediate = 0;

    function decodeCharacterVersion2(c) {
      if (c === ESCAPE_SPACE) {
        printCharacter(CODE_SPACE);
      } else if (c === ESCAPE_NEW_LINE) {
        if (version < 2) {
          printCharacter(CODE_NEWLINE);
        } else if (abbreviation) {
          return 'nested abbreviation';
        } else {
          state = DECODE_STATE_ABBREVIATION;
          intermediate = (c - 1) << 5;
        }
      } else if (c === ESCAPE_SHIFT_UP) {
        alphabetPrevious = alphabetCurrent;
        alphabetCurrent = shiftUp(alphabetCurrent);
      } else if (c === ESCAPE_SHIFT_DOWN) {
        alphabetPrevious = alphabetCurrent;
        alphabetCurrent = shiftDown(alphabetCurrent);
      } else if (c === ESCAPE_SHIFT_LOCK_UP) {
        alphabetPrevious = shiftUp(alphabetCurrent);
        alphabetCurrent = alphabetPrevious;
      } else if (c === ESCAPE_SHIFT_LOCK_DOWN) {
        alphabetPrevious = shiftDown(alphabetCurrent);
        alphabetCurrent = alphabetPrevious;
      } else {
        if (isZsciiEscape(alphabetCurrent, c)) {
          state = DECODE_STATE_ZSCII_HIGH;
        } else {
          const character = alphabetTable[alphabetCurrent][c - 6];
          printCharacter(character.charCodeAt(0));
        }
        alphabetCurrent = alphabetPrevious;
      }
      return '';
    }

    function decodeCharacterVersion3(c) {
      if (c === ESCAPE_SPACE) {
        printCharacter(CODE_SPACE);
      } else if (c < ESCAPE_SHIFT_LOCK_UP) {
        if (abbreviation) {
          return 'nested abbreviation';
        }
        state = DECODE_STATE_ABBREVIATION;
        intermediate = (c - 1) << 5;
      } else if (c === ESCAPE_SHIFT_LOCK_UP) {
        alphabetCurrent = ALPHABET_UPPER;
      } else if (c === ESCAPE_SHIFT_LOCK_DOWN) {
        alphabetCurrent = ALPHABET_PUNCTUATION;
      } else {
        if (isZsciiEscape(alphabetCurrent, c)) {
          state = DECODE_STATE_ZSCII_HIGH;
        } else {
          const character = alphabetTable[alphabetCurrent][c - 6];
          printCharacter(character.charCodeAt(0));
        }
        alphabetCurrent = ALPHABET_LOWER;
      }
      return '';
    }

    const decodeCharacter = (version < 3) ? decodeCharacterVersion2 : decodeCharacterVersion3;

    let characterAddress = address;
    const chars = (function* characterSequence() {
      let done = false;
      while (!done) {
        const element = readWord(characterAddress);
        yield (element >> 10) & 0x1F;
        yield (element >> 5) & 0x1F;
        yield (element >> 0) & 0x1F;
        characterAddress += 2;
        done = (element & 0x8000) !== 0;
      }
    }());

    for (let item = chars.next(); !item.done; item = chars.next()) {
      const { value: c } = item;
      if (state === DECODE_STATE_NORMAL) {
        const message = decodeCharacter(c);
        if (message) {
          error(message);
          return 0;
        }
      } else if (state === DECODE_STATE_ABBREVIATION) {
        state = DECODE_STATE_NORMAL;
        const abbreviationAddress = getAbbreviationAddress(intermediate + c);
        printString(abbreviationAddress, true);
      } else if (state === DECODE_STATE_ZSCII_HIGH) {
        state = DECODE_STATE_ZSCII_LOW;
        intermediate = (c << 5);
      } else if (state === DECODE_STATE_ZSCII_LOW) {
        state = DECODE_STATE_NORMAL;
        printCharacter(intermediate + c);
      }
    }

    if (abbreviation && state !== DECODE_STATE_NORMAL) {
      error('abbreviation ended in incomplete zscii character');
      return 0;
    }
    return characterAddress;
  }

  // Random numbers
  function doRandom(range) {
    const signedRange = signExtend16(range);
    if (signedRange < 0) {
      // TODO use a random number generator we can set the seed
      return 0;
    } if (signedRange === 0) {
      // TODO use a random number generator we can set the seed
      return 0;
    }
    // TODO use a random number generator
    return 1 + Math.floor(range * Math.random());
  }

  // Control flow
  function doCall(target, args) {
    const variable = readInstructionByte();
    if (target === 0) {
      writeVariable(variable, 0);
      return;
    }
    const returnAddress = readPC();
    writePC(getUnpackedAddress(target));
    const localCount = readInstructionByte();
    const locals = [];
    for (let i = 0; i < localCount; i += 1) {
      locals.push(readInstructionWord());
    }
    const argCount = Math.min(args.length, localCount);
    for (let i = 0; i < argCount; i += 1) {
      locals[i] = args[i];
    }
    pushStackFrame(returnAddress, variable, locals);
  }

  function doReturn(value) {
    const { returnAddress, variable } = popStackFrame();
    writeVariable(variable, value);
    writePC(returnAddress);
  }

  function doBranch({ negate, offset }, condition) {
    if (condition ^ negate) {
      if (offset === 0 || offset === 1) {
        doReturn(offset);
      } else {
        writePC(readPC() + offset - 2);
      }
    }
  }

  // Text buffer
  function writeToTextBuffer(textBuffer, text) {
    const textPosition = textBuffer + 1;
    for (let i = 0; i < text.length; i += 1) {
      writeByte(textPosition + i, text.charCodeAt(i));
    }
  }

  // Parse buffer
  function writeToParseBuffer(parseBuffer, entries) {
    writeByte(parseBuffer + 1, entries.length);
    let parsedPosition = parseBuffer + 2;
    for (let i = 0; i < entries.length; i += 1) {
      const { word, length, start } = entries[i];
      writeWord(parsedPosition, word);
      writeByte(parsedPosition + 2, length);
      writeByte(parsedPosition + 3, start);
      parsedPosition += 4;
    }
  }

  // 2OPS
  function illegal() {
    error('illegal');
  }

  function je([op1, ...op2]) {
    doBranch(readInstructionBranch(), op2.includes(op1));
  }

  function jl([op1, op2]) {
    doBranch(readInstructionBranch(), signExtend16(op1) < signExtend16(op2));
  }

  function jg([op1, op2]) {
    doBranch(readInstructionBranch(), signExtend16(op1) > signExtend16(op2));
  }

  function decChk([variable, b]) {
    const a = (readVariable(variable) - 1) & 0xFFFF;
    writeVariable(variable, a);
    doBranch(readInstructionBranch(), signExtend16(a) < signExtend16(b));
  }

  function incChk([variable, b]) {
    const a = (readVariable(variable) + 1) & 0xFFFF;
    writeVariable(variable, a);
    doBranch(readInstructionBranch(), signExtend16(a) > signExtend16(b));
  }

  function jin([object, parent]) {
    if (object === 0) {
      return;
    }
    doBranch(readInstructionBranch(), readObjectParent(object) === parent);
  }

  function test([bitmap, flags]) {
    doBranch(readInstructionBranch(), (bitmap & flags) === flags);
  }

  function or([op1, op2]) {
    writeVariable(readInstructionByte(), op1 | op2);
  }

  function and([op1, op2]) {
    writeVariable(readInstructionByte(), op1 & op2);
  }

  function testAttr([object, attribute]) {
    doBranch(readInstructionBranch(), readObjectAttribute(object, attribute) === Z_MACHINE_TRUE);
  }

  function setAttr([object, attribute]) {
    writeObjectAttribute(object, attribute, Z_MACHINE_TRUE);
  }

  function clearAttr([object, attribute]) {
    writeObjectAttribute(object, attribute, Z_MACHINE_FALSE);
  }

  function store([variable, value]) {
    writeVariable(variable, value);
  }

  function insertObj([object, destination]) {
    insertObject(object, destination);
  }

  function loadW([arrayAddress, element]) {
    writeVariable(
      readInstructionByte(),
      readWord(arrayAddress + 2 * element),
    );
  }

  function loadB([arrayAddress, element]) {
    writeVariable(
      readInstructionByte(),
      readByte(arrayAddress + element),
    );
  }

  function getProp([object, property]) {
    writeVariable(readInstructionByte(), readObjectProperty(object, property));
  }

  function getPropAddr([object, property]) {
    const { address } = findObjectPropertySizeAndAddress(object, property);
    writeVariable(readInstructionByte(), address);
  }

  function getNextProp([object, property]) {
    const nextProperty = findObjectNextPropertyNumber(object, property);
    writeVariable(readInstructionByte(), nextProperty);
  }

  function add([op1, op2]) {
    writeVariable(readInstructionByte(), op1 + op2);
  }

  function sub([op1, op2]) {
    writeVariable(readInstructionByte(), op1 - op2);
  }

  function mul([op1, op2]) {
    writeVariable(readInstructionByte(), signExtend16(op1) * signExtend16(op2));
  }

  function div([op1, op2]) {
    if (op2 === 0) {
      error('divide by zero');
      return;
    }
    writeVariable(readInstructionByte(), Math.trunc(signExtend16(op1) / signExtend16(op2)));
  }

  function mod([op1, op2]) {
    if (op2 === 0) {
      error('divide by zero');
      return;
    }
    writeVariable(readInstructionByte(), signExtend16(op1) % signExtend16(op2));
  }

  // 1OPS
  function jz([op1]) {
    doBranch(readInstructionBranch(), op1 === 0);
  }

  function getSibling([object]) {
    const variable = readInstructionByte();
    const sibling = readObjectSibling(object);
    writeVariable(variable, sibling);
    doBranch(readInstructionBranch(), sibling !== 0);
  }

  function getChild([object]) {
    const variable = readInstructionByte();
    const child = readObjectChild(object);
    writeVariable(variable, child);
    doBranch(readInstructionBranch(), child !== 0);
  }

  function getParent([object]) {
    writeVariable(readInstructionByte(), readObjectParent(object));
  }

  function getPropLen([address]) {
    const variable = readInstructionByte();
    if (address === 0) {
      writeVariable(variable, 0);
    } else {
      const { size } = readObjectPropertyNumberAndSize(address - 1);
      writeVariable(variable, size);
    }
  }

  function inc([variable]) {
    writeVariable(variable, readVariable(variable) + 1);
  }

  function dec([variable]) {
    writeVariable(variable, readVariable(variable) - 1);
  }

  function printAddr([address]) {
    printString(address);
  }

  function removeObj([object]) {
    removeObject(object);
  }

  function printObj([object]) {
    printString(getObjectNameAddress(object));
  }

  function ret([op1]) {
    doReturn(op1);
  }

  function jump([op1]) {
    writePC(readPC() + signExtend16(op1) - 2);
  }

  function printPaddr([address]) {
    printString(getUnpackedAddress(address));
  }

  function load([variable]) {
    writeVariable(readInstructionByte(), readVariable(variable));
  }

  function not() {
    unimplemented('not');
  }

  // 0OPS
  function rtrue() {
    doReturn(Z_MACHINE_TRUE);
  }

  function rfalse() {
    doReturn(Z_MACHINE_FALSE);
  }

  function print() {
    writePC(printString(readPC()));
  }

  function printRet() {
    printString(readPC());
    printCharacter('\n'.charCodeAt(0));
    doReturn(Z_MACHINE_TRUE);
  }

  function nop() {
  }

  function save() {
    unimplemented('save');
  }

  function restore() {
    unimplemented('restore');
  }

  function restart() {
    unimplemented('restart');
  }

  function retPopped() {
    doReturn(readVariable(0));
  }

  function pop() {
    unimplemented('pop');
  }

  function quit() {
    writeRunning(false);
  }

  function newLine() {
    printCharacter('\n'.charCodeAt(0));
  }

  function showStatus() {
    unimplemented('showStatus');
  }

  function verify() {
    doBranch(readInstructionBranch(), fileChecksum === headerFileChecksum);
  }

  // VAR
  function call([target = 0, ...args]) {
    doCall(target, args);
  }

  function storeW([arrayAddress, element, value]) {
    writeWord(arrayAddress + 2 * element, value);
  }

  function storeB([arrayAddress, element, value]) {
    writeByte(arrayAddress + element, value);
  }

  function putProp([object, property, value]) {
    writeObjectProperty(object, property, value);
  }

  function sread([textBuffer, parseBuffer]) {
    const text = readlineSync.question().toLowerCase()
      .concat('\0');

    writeToTextBuffer(textBuffer, text);

    const tokens = tokenizeString(text);

    writeToParseBuffer(parseBuffer, tokens);
  }

  function printChar([char]) {
    printCharacter(char);
  }

  function printNum([op1]) {
    printNumber(op1);
  }

  function random([range]) {
    writeVariable(readInstructionByte(), doRandom(range));
  }

  function push([value]) {
    writeVariable(VARIABLE_STACK, value);
  }

  function pull([variable]) {
    writeVariable(variable, readVariable(VARIABLE_STACK));
  }

  function splitWindow() {
    unimplemented('splitWindow');
  }

  function setWindow() {
    unimplemented('setWindow');
  }

  function outputStream() {
    unimplemented('outputStream');
  }

  function inputStream() {
    unimplemented('inputStream');
  }

  function soundEffect() {
    unimplemented('soundEffect');
  }

  const twoOperandInstructions = [
    illegal,
    je,
    jl,
    jg,
    decChk,
    incChk,
    jin,
    test,
    or,
    and,
    testAttr,
    setAttr,
    clearAttr,
    store,
    insertObj,
    loadW,
    loadB,
    getProp,
    getPropAddr,
    getNextProp,
    add,
    sub,
    mul,
    div,
    mod,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
  ];

  const oneOperandInstructions = [
    jz,
    getSibling,
    getChild,
    getParent,
    getPropLen,
    inc,
    dec,
    printAddr,
    illegal,
    removeObj,
    printObj,
    ret,
    jump,
    printPaddr,
    load,
    not,
  ];

  const zeroOperandInstructions = [
    rtrue,
    rfalse,
    print,
    printRet,
    nop,
    save,
    restore,
    restart,
    retPopped,
    pop,
    quit,
    newLine,
    showStatus,
    verify,
    illegal,
    illegal,
  ];

  const varOperandInstructions = [
    call,
    storeW,
    storeB,
    putProp,
    sread,
    printChar,
    printNum,
    random,
    push,
    pull,
    splitWindow,
    setWindow,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    outputStream,
    inputStream,
    soundEffect,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
    illegal,
  ];

  function execute() {
    const opcode = readInstructionByte();
    if (opcode < 0x80) {
      const variantOperandTypes = [0x5F, 0x6F, 0x9F, 0xAF];
      const variant = opcode >> 5;
      const operandTypes = variantOperandTypes[variant];
      const operands = readInstructionOperands(operandTypes);
      twoOperandInstructions[opcode & 0x1F](operands);
    } else if (opcode < 0xB0) {
      const variantOperandTypes = [0x3F, 0x7F, 0xBF];
      const variant = (opcode >> 4) & 0x3;
      const operandTypes = variantOperandTypes[variant];
      const operands = readInstructionOperands(operandTypes);
      oneOperandInstructions[opcode & 0xF](operands);
    } else if (opcode < 0xC0) {
      zeroOperandInstructions[opcode & 0xF]();
    } else if (opcode < 0xE0) {
      const operandTypes = readInstructionByte();
      const operands = readInstructionOperands(operandTypes);
      twoOperandInstructions[opcode & 0x1F](operands);
    } else {
      const operandTypes = readInstructionByte();
      const operands = readInstructionOperands(operandTypes);
      varOperandInstructions[opcode & 0x1F](operands);
    }
  }

  pushStackFrame(0, 0, []);
  while (readRunning()) {
    execute();
  }
};
