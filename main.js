class Scale {
    constructor(notes, startOctave, numOctaves) {
        this.notes = notes;
        this.startOctave = startOctave;
        this.numOctaves = numOctaves;
    }

    numNotes() {
        return this.numOctaves * this.notes.length;
    }

    allNotes() {
        let notes = [];
        for (let i=0; i<this.numNotes(); i++) {
            notes.push(this.note(i));
        }
        return notes;
    }

    root() {
        return this.notes[0];
    }

    note(degree) {
        degree = mod(degree, this.numNotes());
        let note = this.notes[degree % this.notes.length];
        let octave = Math.floor(degree / this.notes.length);
        if (octave >= this.numOctaves) {
            octave = octave % this.numOctaves;
        }
        octave += this.startOctave;
        return `${note}${octave}`;
    }
}

function parseNote(note) {
    let parts = note.match(/^([A-Ga-g])(b|#)?(\d)*$/);
    if (parts === null) {
        throw new Error(`Couldn't parse note "${note}"`);
    }
    return {
        letter: parts[1].toUpperCase(),
        accidental: parts[2],
        number: parts[3],
    };
}

function enharmonicFlat(note) {
    if (note.length === 2) {
        return note;
    }
    let parsed = parseNote(note);
    if (parsed.accidental === '' || parsed.accidental === 'b') {
        return note;
    } else if (parsed.accidental === '#') {
        let newNote = {
            'C': 'Db',
            'D': 'Eb',
            'E': 'F',
            'F': 'Gb',
            'G': 'Ab',
            'A': 'Bb',
            'B': 'C',
        }[parsed.letter];
        if (newNote === 'C') {
            parsed.number += 1;
        }
        return `${newNote}${parsed.number}`;
    } else {
        throw new Error(`Unsupported accidental ${note}`);
    }
}

function mod(x, m) {
    let r = x % m;
    return r < 0 ? r+m : r;
}

class Player {
    constructor(scale) {
        this.scale = scale;
        // start about halfway through the scale (on the root note)
        this.scaleDegree = Math.floor(scale.numOctaves / 2) * scale.notes.length;
    }

    async load(ctx) {
        let notes = await loadNotes(ctx, 'mf', this.scale.allNotes());
        this.notes = {};
        notes.forEach(note => {
            if (note !== undefined) {
                this.notes[note.noteName] = note;
            }
        })
    }

    jump(interval) {
        this.scaleDegree += interval;
        let noteName = this.scale.note(this.scaleDegree);
        let note = this.notes[noteName];
        this.notes[noteName] = cloneNote(note);
        note.start();
        return note;
    }
}

async function loadBuffer(ctx, path) {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

function createBufferSource(ctx, buffer) {
    let source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    return source;
}

async function loadNotes(ctx, volume, notes) {
    return await Promise.all(notes.map(async (note) => {
        try {
            const buffer = await loadBuffer(ctx, `samples/${volume}/${enharmonicFlat(note)}.mp3`);
            let src = createBufferSource(ctx, buffer);
            src.noteName = note;
            return src;
        } catch (e) {
            console.log(`Failed to load note: ${note}, ${e}`)
        }
    }));
}

function cloneNote(note) {
    return createBufferSource(note.context, note.buffer);
}

const KEY_INTERVALS = {
    'a': -4, 's': -3, 'd': -2, 'f': -1,
    ' ': 0,
    'j': 1, 'k': 2, 'l': 3, ';': 4,
}

Object.keys(KEY_INTERVALS).forEach(key => {
    KEY_INTERVALS[key === ';' ? ':' : key.toUpperCase()] = KEY_INTERVALS[key] + Math.sign(KEY_INTERVALS[key]) * 4;
})

function createDegree(note) {
    let degree = document.createElement('div');
    degree.className = 'degree';
    degree.id = escapeNote(note);
    let noteElement = createClassDiv('note');
    noteElement.innerText = note;
    degree.appendChild(noteElement);
    degree.appendChild(createClassDiv('key'));
    degree.appendChild(createClassDiv('interval'));
    return degree;
}

function createClassDiv(className) {
    let div = document.createElement('div');
    div.className = className;
    return div;
}

function createScale(scale) {
    let container = document.getElementById('ribbon');
    container.innerHTML = '';
    scale.allNotes().forEach(note => {
        let degree = createDegree(note);
        if (parseNote(note).letter === scale.root()) {
            degree.className += ' root';
        }
        container.appendChild(degree);
    });
}

async function parseScale(input, ctx) {
    let letters = input.split(/\s+/);
    letters = letters.map(letter => {
        let parsed = parseNote(letter);
        return `${parsed.letter}${parsed.accidental || ''}`;
    });
    let scale = new Scale(letters, 3, 5);
    let player = new Player(scale);
    await player.load(ctx);
    return [scale, player];
}

function escapeNote(note) {
    return note.replace(/#/g, 'sharp');
}

function getClassForInterval(interval) {
    interval = Math.abs(interval);
    if (interval > 4) {
        interval -= 4;
    }
    return interval;
}

function updateScale(scale, degree, shifted) {
    let keys = 'asdf jkl;';
    if (shifted) {
        keys = keys.toUpperCase().replace(';', ':');
    }
    document.querySelectorAll('.interval, .key').forEach(cell => {
        cell.innerText = '';
    });
    document.querySelectorAll('.degree').forEach(cell => {
        cell.classList.remove('zero', 'one', 'two', 'three', 'four');
    });
    for (let i=0; i<keys.length; i++) {
        let key = keys[i];
        let interval = KEY_INTERVALS[key];
        let newNote = escapeNote(scale.note(degree + interval));
        let degreeDiv = document.querySelector(`#${newNote}`);
        degreeDiv.classList.add([
            'zero', 'one', 'two', 'three', 'four'
        ][getClassForInterval(interval)])
        let keyDiv = document.querySelector(`#${newNote} > .key`);
        keyDiv.innerText = key === ' ' ? '_' : key;
        let intervalDiv = document.querySelector(`#${newNote} > .interval`);
        intervalDiv.innerText = interval;
    }
}

window.addEventListener('load', async () => {
    const ctx = new AudioContext();
    let scaleInput = document.querySelector('#scale-input');
    let scaleError = document.querySelector('#error');
    let scale, player;
    try {
        [scale, player] = await parseScale(scaleInput.value, ctx);
        createScale(scale);
        updateScale(scale, player.scaleDegree);
    } catch (e) {
        scaleError.innerText = `${e}`;
    }
    document.querySelector('#scale-button').addEventListener('mousedown', async () => {
        try {
            [scale, player] = await parseScale(scaleInput.value, ctx);
            createScale(scale);
            updateScale(scale, player.scaleDegree);
        } catch (e) {
            scaleError.innerText = `${e}`;
        }
    });
    let pressedKeys = {};
    let sustainCheckbox = document.querySelector('#sustain > input');
    window.addEventListener('keydown', event => {
        if (event.key === 'Shift') {
            updateScale(scale, player.scaleDegree, true);
            return;
        }
        if (!KEY_INTERVALS.hasOwnProperty(event.key) || event.repeat) {
            return;
        }
        pressedKeys[event.key] = player.jump(KEY_INTERVALS[event.key]);
        updateScale(scale, player.scaleDegree, event.shiftKey);
    });
    window.addEventListener('keyup', event => {
        if (event.key === 'Shift') {
            updateScale(scale, player.scaleDegree);
        } else if (pressedKeys.hasOwnProperty(event.key)) {
            if (!sustainCheckbox.checked) {
                pressedKeys[event.key].stop();
            }
            delete pressedKeys[event.key];
        }
    });
});