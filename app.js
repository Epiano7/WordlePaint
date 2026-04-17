const BOARD_ROWS = 6;
const WORD_LENGTH = 5;
const DEFAULT_TOP = 10;
const TILE_STATES = ["gray", "yellow", "green"];
const STATE_TO_PATTERN = {
  gray: "x",
  yellow: "y",
  green: "g",
};

const boardElement = document.getElementById("board");
const answerInput = document.getElementById("answer-input");
const solveButton = document.getElementById("solve-button");
const clearLettersButton = document.getElementById("clear-letters-button");
const resetBoardButton = document.getElementById("reset-board-button");
const themeToggleButton = document.getElementById("theme-toggle-button");
const statusLine = document.getElementById("status-line");
const resultsOutput = document.getElementById("results-output");

const tiles = [];
let selectedPosition = { row: 0, column: 0 };
let words = [];
const THEME_STORAGE_KEY = "wordlepaint-theme";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function buildBoard() {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    const rowElement = document.createElement("div");
    rowElement.className = "board-row";

    const rowTiles = [];
    for (let column = 0; column < WORD_LENGTH; column += 1) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile gray";
      tile.dataset.row = String(row);
      tile.dataset.column = String(column);
      tile.dataset.state = "gray";
      tile.dataset.letter = "";
      tile.setAttribute("aria-label", `Row ${row + 1} column ${column + 1}`);

      tile.addEventListener("click", () => {
        selectTile(row, column);
        setSelectedState("green");
      });

      tile.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        selectTile(row, column);
        setSelectedState("yellow");
      });

      rowElement.appendChild(tile);
      rowTiles.push(tile);
    }

    boardElement.appendChild(rowElement);
    tiles.push(rowTiles);
  }

  selectTile(0, 0);
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.style.color = isError
    ? "var(--status-error)"
    : "var(--status-ink)";
}

function getStoredThemePreference() {
  return window.localStorage.getItem(THEME_STORAGE_KEY);
}

function getEffectiveTheme(preference) {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return systemThemeQuery.matches ? "dark" : "light";
}

function updateThemeToggleLabel(preference, effectiveTheme) {
  const suffix = preference === "auto" ? `Auto (${effectiveTheme})` : preference[0].toUpperCase() + preference.slice(1);
  themeToggleButton.textContent = `Theme: ${suffix}`;
}

function applyTheme(preference) {
  const normalizedPreference = preference === "light" || preference === "dark" ? preference : "auto";
  const effectiveTheme = getEffectiveTheme(normalizedPreference);
  document.documentElement.dataset.theme = effectiveTheme;
  updateThemeToggleLabel(normalizedPreference, effectiveTheme);
}

function cycleThemePreference() {
  const currentPreference = getStoredThemePreference() ?? "auto";
  const nextPreference = currentPreference === "auto" ? "dark" : currentPreference === "dark" ? "light" : "auto";
  window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  applyTheme(nextPreference);
}

function initializeTheme() {
  applyTheme(getStoredThemePreference() ?? "auto");
  systemThemeQuery.addEventListener("change", () => {
    const storedPreference = getStoredThemePreference() ?? "auto";
    if (storedPreference === "auto") {
      applyTheme("auto");
    }
  });
}

function writeResults(text) {
  resultsOutput.textContent = text;
}

function normalizeWord(raw) {
  return raw.trim().toLowerCase();
}

async function loadWordList() {
  try {
    const response = await fetch("words.txt");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const uniqueWords = new Set();
    text.split(/\r?\n/).forEach((line) => {
      const word = normalizeWord(line);
      if (word.length === WORD_LENGTH && /^[a-z]+$/.test(word)) {
        uniqueWords.add(word);
      }
    });

    words = Array.from(uniqueWords);
    setStatus(`Loaded ${words.length.toLocaleString()} words from words.txt.`);
  } catch (error) {
    setStatus("Could not load words.txt. GitHub Pages must serve it next to index.html.", true);
    writeResults(`Failed to load words.txt.\n${error.message}`);
  }
}

function validateAnswer(answer) {
  const normalized = normalizeWord(answer);
  if (!/^[a-z]{5}$/.test(normalized)) {
    throw new Error("Answer must be exactly 5 alphabetic characters.");
  }
  return normalized;
}

function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill("x");
  const remaining = new Map();

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    const guessChar = guess[index];
    const answerChar = answer[index];
    if (guessChar === answerChar) {
      result[index] = "g";
    } else {
      remaining.set(answerChar, (remaining.get(answerChar) ?? 0) + 1);
    }
  }

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (result[index] === "g") {
      continue;
    }
    const guessChar = guess[index];
    const count = remaining.get(guessChar) ?? 0;
    if (count > 0) {
      result[index] = "y";
      remaining.set(guessChar, count - 1);
    }
  }

  return result.join("");
}

function canUseAnswerWord(rowNumber) {
  return rowNumber === 6;
}

function countLetters(word) {
  const counts = new Map();
  for (const char of word) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}

function patternDistance(actual, requested) {
  let mismatches = 0;
  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (actual[index] !== requested[index]) {
      mismatches += 1;
    }
  }
  return mismatches;
}

function explainPatternDifference(guess, answer, requested, actual) {
  const guessCounts = countLetters(guess);
  const answerCounts = countLetters(answer);
  const repeatedGuess = new Set([...guessCounts.entries()].filter((entry) => entry[1] > 1).map((entry) => entry[0]));
  const repeatedAnswer = new Set([...answerCounts.entries()].filter((entry) => entry[1] > 1).map((entry) => entry[0]));

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    const wanted = requested[index];
    const received = actual[index];
    if (wanted === received) {
      continue;
    }

    const letter = guess[index];
    const position = index + 1;

    if (wanted === "g" && received !== "g") {
      return `Position ${position} needed green, but '${letter}' was not exact.`;
    }
    if (wanted === "y" && received === "x") {
      if (repeatedGuess.has(letter) || repeatedAnswer.has(letter)) {
        return `Position ${position} needed yellow, but duplicate-letter accounting left no unmatched '${letter}' in the answer.`;
      }
      return `Position ${position} needed yellow, but '${letter}' is not available elsewhere in the answer.`;
    }
    if (wanted === "y" && received === "g") {
      return `Position ${position} needed yellow, but '${letter}' became green at that position.`;
    }
    if (wanted === "x" && received === "g") {
      return `Position ${position} needed gray, but '${letter}' is exact there.`;
    }
    if (wanted === "x" && received === "y") {
      if (repeatedGuess.has(letter) || repeatedAnswer.has(letter)) {
        return `Position ${position} needed gray, but duplicate-letter rules still leave an unmatched '${letter}' elsewhere.`;
      }
      return `Position ${position} needed gray, but '${letter}' still appears elsewhere in the answer.`;
    }
    if (wanted === "g" && received === "y") {
      return `Position ${position} needed green, but '${letter}' is present only in another position.`;
    }
  }

  return "Pattern differed in multiple positions.";
}

function buildNearMisses(answer, pattern, rowNumber, limit = DEFAULT_TOP) {
  const misses = [];

  for (const word of words) {
    const actualPattern = scoreGuess(word, answer);
    if (actualPattern === pattern) {
      continue;
    }
    if (word === answer && !canUseAnswerWord(rowNumber)) {
      continue;
    }
    misses.push({
      word,
      actualPattern,
      mismatches: patternDistance(actualPattern, pattern),
      reason: explainPatternDifference(word, answer, pattern, actualPattern),
    });
  }

  misses.sort((left, right) => {
    if (left.mismatches !== right.mismatches) {
      return left.mismatches - right.mismatches;
    }
    return left.word.localeCompare(right.word);
  });

  return misses.slice(0, limit);
}

function findMatches(answer, pattern, allowAnswer = false) {
  return words.filter((word) => {
    if (word === answer && !allowAnswer) {
      return false;
    }
    return scoreGuess(word, answer) === pattern;
  });
}

function analyzeRow(answer, pattern, rowNumber, nearMissLimit = DEFAULT_TOP) {
  const allowAnswer = canUseAnswerWord(rowNumber);
  const matches = findMatches(answer, pattern, allowAnswer);
  const unrestrictedMatches = matches.length === 0 ? findMatches(answer, pattern, true) : matches;
  const answerMatchesPattern = scoreGuess(answer, answer) === pattern;
  const nearMisses = buildNearMisses(answer, pattern, rowNumber, nearMissLimit);

  return {
    rowNumber,
    pattern,
    matches,
    nearMisses,
    closestMatch: nearMisses[0] ?? null,
    onlyAnswerMatches: matches.length === 0 && unrestrictedMatches.length === 1 && unrestrictedMatches[0] === answer,
    answerMatchBlocked: answerMatchesPattern && !allowAnswer,
  };
}

function explainFailure(answer, pattern, rowNumber, nearMissLimit = DEFAULT_TOP) {
  const unrestrictedMatches = findMatches(answer, pattern, true);
  if (unrestrictedMatches.length === 1 && unrestrictedMatches[0] === answer && !canUseAnswerWord(rowNumber)) {
    return `Only the answer word '${answer}' produces pattern '${pattern}', but the answer may be used only on guess 6, not on row ${rowNumber}.`;
  }

  const nearMisses = buildNearMisses(answer, pattern, rowNumber, nearMissLimit);
  const lines = [`No words in the word list produce pattern '${pattern}' against answer '${answer}'.`];

  if (unrestrictedMatches.length === 0) {
    lines.push("No exact match exists even if the answer word is allowed.");
  } else if (unrestrictedMatches.includes(answer) && !canUseAnswerWord(rowNumber)) {
    lines.push(`The answer word '${answer}' would match, but row ${rowNumber} cannot use the answer.`);
  }

  if (nearMisses.length > 0) {
    lines.push(`Closest fallback for row ${rowNumber}: ${nearMisses[0].word} -> ${nearMisses[0].actualPattern}`);
    lines.push("Closest candidates:");
    nearMisses.forEach((miss) => {
      lines.push(`  - ${miss.word}: produced ${miss.actualPattern} (${miss.reason})`);
    });
  }

  return lines.join("\n");
}

function solvePatterns(answer, patterns, allowRepeatedGuesses = true, nearMissLimit = DEFAULT_TOP) {
  const rowResults = [];
  let firstFailedRowResult = null;

  patterns.forEach((pattern, index) => {
    const rowNumber = index + 1;
    const rowResult = analyzeRow(answer, pattern, rowNumber, nearMissLimit);
    rowResults.push(rowResult);
    if (!firstFailedRowResult && rowResult.matches.length === 0) {
      firstFailedRowResult = rowResult;
    }
  });

  if (firstFailedRowResult) {
    const fallbackSequence = [];
    for (const rowResult of rowResults) {
      if (rowResult.matches.length > 0) {
        fallbackSequence.push(rowResult.matches[0]);
      } else if (rowResult.closestMatch) {
        fallbackSequence.push(rowResult.closestMatch.word);
        break;
      } else {
        break;
      }
    }

    return {
      success: false,
      sequence: [],
      fallbackSequence,
      failedRow: firstFailedRowResult.rowNumber,
      failureReason: explainFailure(answer, firstFailedRowResult.pattern, firstFailedRowResult.rowNumber, nearMissLimit),
      rowResults,
    };
  }

  if (allowRepeatedGuesses) {
    return {
      success: true,
      sequence: rowResults.map((rowResult) => rowResult.matches[0]),
      fallbackSequence: [],
      failedRow: null,
      failureReason: null,
      rowResults,
    };
  }

  const orderedRows = rowResults
    .map((rowResult, index) => ({ rowResult, index }))
    .sort((left, right) => left.rowResult.matches.length - right.rowResult.matches.length);
  const chosen = new Map();
  const usedWords = new Set();

  function backtrack(position) {
    if (position >= orderedRows.length) {
      return true;
    }

    const { rowResult, index } = orderedRows[position];
    for (const candidate of rowResult.matches) {
      if (usedWords.has(candidate)) {
        continue;
      }
      chosen.set(index, candidate);
      usedWords.add(candidate);
      if (backtrack(position + 1)) {
        return true;
      }
      chosen.delete(index);
      usedWords.delete(candidate);
    }
    return false;
  }

  if (backtrack(0)) {
    return {
      success: true,
      sequence: rowResults.map((_, index) => chosen.get(index)),
      fallbackSequence: [],
      failedRow: null,
      failureReason: null,
      rowResults,
    };
  }

  return {
    success: false,
    sequence: [],
    fallbackSequence: [],
    failedRow: null,
    failureReason: "Each row has at least one match, but no full sequence exists without reusing guess words.",
    rowResults,
  };
}

function setTileState(tile, state) {
  tile.dataset.state = state;
  tile.classList.remove(...TILE_STATES);
  tile.classList.add(state);
}

function setTileLetter(tile, letter) {
  tile.dataset.letter = letter.toUpperCase();
  tile.textContent = tile.dataset.letter;
}

function selectTile(row, column) {
  const currentTile = tiles[selectedPosition.row][selectedPosition.column];
  currentTile.classList.remove("selected");

  selectedPosition = { row, column };

  const nextTile = tiles[row][column];
  nextTile.classList.add("selected");
  nextTile.focus();
}

function setSelectedState(state) {
  const tile = tiles[selectedPosition.row][selectedPosition.column];
  setTileState(tile, state);
}

function moveSelection(rowDelta, columnDelta) {
  const nextRow = Math.max(0, Math.min(BOARD_ROWS - 1, selectedPosition.row + rowDelta));
  const nextColumn = Math.max(0, Math.min(WORD_LENGTH - 1, selectedPosition.column + columnDelta));
  selectTile(nextRow, nextColumn);
}

function getPatterns() {
  return tiles.map((rowTiles) => rowTiles.map((tile) => STATE_TO_PATTERN[tile.dataset.state]).join(""));
}

function clearLetters() {
  tiles.flat().forEach((tile) => setTileLetter(tile, ""));
  writeResults("Cleared letters from the board.");
}

function resetBoard() {
  tiles.flat().forEach((tile) => {
    setTileState(tile, "gray");
    setTileLetter(tile, "");
  });
  writeResults("Board reset.");
}

function pickDisplayWords(result) {
  if (result.success) {
    return result.sequence;
  }
  return result.rowResults.map((rowResult) => {
    if (rowResult.matches.length > 0) {
      return rowResult.matches[0];
    }
    if (rowResult.closestMatch) {
      return rowResult.closestMatch.word;
    }
    return "";
  });
}

function renderWordsOnBoard(displayWords) {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    const word = displayWords[row] ?? "";
    for (let column = 0; column < WORD_LENGTH; column += 1) {
      const letter = column < word.length ? word[column] : "";
      setTileLetter(tiles[row][column], letter);
    }
  }
}

function formatRowSummary(rowResult) {
  const lines = [`Row ${rowResult.rowNumber}: pattern '${rowResult.pattern}'`];
  if (rowResult.matches.length > 0) {
    lines.push(`  Matches found: ${rowResult.matches.length}`);
    lines.push(`  Showing up to ${DEFAULT_TOP}: ${rowResult.matches.slice(0, DEFAULT_TOP).join(", ")}`);
    if (rowResult.matches.length > DEFAULT_TOP) {
      lines.push(`  ...and ${rowResult.matches.length - DEFAULT_TOP} more`);
    }
  } else {
    lines.push("  Matches found: 0");
    if (rowResult.closestMatch) {
      lines.push(`  Closest fallback: ${rowResult.closestMatch.word} -> ${rowResult.closestMatch.actualPattern}`);
    }
    if (rowResult.onlyAnswerMatches) {
      lines.push("  Only the answer word matches, but this row cannot use the answer.");
    } else if (rowResult.answerMatchBlocked) {
      lines.push("  The answer would match this pattern, but this row cannot use it.");
    }
    if (rowResult.nearMisses.length > 0) {
      lines.push("  Near misses:");
      rowResult.nearMisses.slice(0, DEFAULT_TOP).forEach((miss) => {
        lines.push(`    - ${miss.word}: ${miss.actualPattern} (${miss.reason})`);
      });
    }
  }
  return lines;
}

function formatResults(answer, result) {
  const lines = [
    `Loaded word list`,
    `  Valid 5-letter words: ${words.length}`,
    `  Answer word: ${answer}`,
    "",
    "Row analysis",
  ];

  result.rowResults.forEach((rowResult) => {
    lines.push(...formatRowSummary(rowResult));
  });

  if (result.success) {
    lines.push("", "Full solution");
    result.sequence.forEach((guess, index) => {
      lines.push(`  Row ${index + 1}: ${guess} -> ${scoreGuess(guess, answer)}`);
    });
  } else {
    lines.push("", "Failure explanation");
    if (result.failedRow !== null) {
      lines.push(`  First failed row: ${result.failedRow}`);
    }
    if (result.failureReason) {
      result.failureReason.split("\n").forEach((line) => {
        lines.push(`  ${line}`);
      });
    }
    if (result.fallbackSequence.length > 0) {
      lines.push("", "Closest fallback sequence");
      result.fallbackSequence.forEach((guess, index) => {
        lines.push(`  Row ${index + 1}: ${guess} -> ${scoreGuess(guess, answer)}`);
      });
    }
  }

  return lines.join("\n");
}

function solveBoard() {
  if (words.length === 0) {
    writeResults("Cannot solve because words.txt is not loaded.");
    return;
  }

  let answer;
  try {
    answer = validateAnswer(answerInput.value);
  } catch (error) {
    writeResults(`Error: ${error.message}`);
    answerInput.focus();
    return;
  }

  const patterns = getPatterns();
  const result = solvePatterns(answer, patterns, true, DEFAULT_TOP);
  renderWordsOnBoard(pickDisplayWords(result));
  writeResults(formatResults(answer, result));
}

function handleKeydown(event) {
  const activeElement = document.activeElement;
  if (activeElement === answerInput) {
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1, 0);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1, 0);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveSelection(0, -1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveSelection(0, 1);
  } else if (event.key === "g" || event.key === "G") {
    event.preventDefault();
    setSelectedState("green");
  } else if (event.key === "y" || event.key === "Y") {
    event.preventDefault();
    setSelectedState("yellow");
  } else if (event.key === "x" || event.key === "X" || event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    setSelectedState("gray");
  }
}

buildBoard();
initializeTheme();
solveButton.addEventListener("click", solveBoard);
clearLettersButton.addEventListener("click", clearLetters);
resetBoardButton.addEventListener("click", resetBoard);
themeToggleButton.addEventListener("click", cycleThemePreference);
document.addEventListener("keydown", handleKeydown);
loadWordList();
