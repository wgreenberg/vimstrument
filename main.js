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
        // return the note name for a degree
        // scale.note(0) => "C1"
        // scale.note(1) => "B2"
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
    let parts = note.match(/^([A-G])(b*|#*)(\d+)$/);
    if (parts === null) {
        throw new Error(`Couldn't parse note "${note}"`);
    }
    return {
        letter: parts[1],
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
        if (newLetter === 'C') {
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
        this.scaleDegree = Math.floor(scale.numOctaves / 2) * scale.notes.length;
    }

    async load(ctx) {
        let notes = await loadNotes(ctx, 'mf', this.scale.allNotes());
        this.notes = {};
        this.scale.allNotes().forEach((note, i) => {
            this.notes[note] = notes[i];
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
        const buffer = await loadBuffer(ctx, `samples/${volume}/${enharmonicFlat(note)}.mp3`);
        return createBufferSource(ctx, buffer);
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

function createDegree(note) {
    let degree = document.createElement('div');
    degree.className = 'degree';
    degree.id = note;
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
    scale.allNotes().forEach(note => {
        let degree = createDegree(note);
        if (parseNote(note).letter === scale.root()) {
            degree.className += ' root';
        }
        container.appendChild(degree);
    });
}

function updateScale(scale, degree) {
    let keys = 'asdf jkl;';
    document.querySelectorAll('.interval, .key').forEach(cell => {
        cell.innerText = '';
    })
    document.querySelectorAll('.degree').forEach(cell => {
        cell.classList.remove('zero', 'one', 'two', 'three', 'four');
    })
    for (let i=0; i<keys.length; i++) {
        let key = keys[i];
        let interval = KEY_INTERVALS[key];
        let newNote = scale.note(degree + interval);
        let degreeDiv = document.querySelector(`#${newNote}`);
        degreeDiv.classList.add([
            'zero', 'one', 'two', 'three', 'four'
        ][Math.abs(interval)])
        let keyDiv = document.querySelector(`#${newNote} > .key`);
        keyDiv.innerText = key;
        let intervalDiv = document.querySelector(`#${newNote} > .interval`);
        intervalDiv.innerText = interval;
    }
}

window.addEventListener('load', async () => {
    const ctx = new AudioContext();
    let scale = new Scale(['C', 'D', 'E', 'F', 'G', 'A', 'B'], 3, 5);
    let player = new Player(scale);
    await player.load(ctx);
    let pressedKeys = {};
    createScale(scale);
    updateScale(scale, player.scaleDegree);
    window.addEventListener('keypress', event => {
        if (!KEY_INTERVALS.hasOwnProperty(event.key) || event.repeat) {
            return;
        }
        pressedKeys[event.key] = player.jump(KEY_INTERVALS[event.key]);
        updateScale(scale, player.scaleDegree);
    });
    window.addEventListener('keyup', event => {
        if (pressedKeys.hasOwnProperty(event.key)) {
            //pressedKeys[event.key].stop();
            delete pressedKeys[event.key];
        }
    })
});