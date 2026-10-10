/*
    codify.js

    Live multi-language code view for Snap! — full semantic parity export.

    Covers Snap oddities:
      • 1-based indexes + last/any/random/all/parent options
      • hyperblocks (list-aware arithmetic / comparisons)
      • variadic ops (sum/product/min/max/=/</>/and/or/identical)
      • if / else-if chains (%elseif MultiArg)
      • rings with formal parameters
      • script variables MultiArg
      • custom blocks → functions (spaces sanitized)
      • nested reporter composition

    written for itsgeagle/Snap
    https://github.com/itsgeagle/Snap

    This file is part of Snap!

    Snap! is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of
    the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

/*global Morph, PushButtonMorph,
ScrollFrameMorph, TextMorph, StringMorph, MenuMorph, Point,
Color, StageMorph, BlockMorph, HatBlockMorph, localize,
MorphicPreferences, WHITE, ZERO, SymbolMorph, modules, saveAs,
InputSlotMorph, TemplateSlotMorph, SpriteMorph, contains, isNil,
MultiArgMorph, CSlotMorph, BooleanSlotMorph, RingMorph, List, detect*/

/*jshint esversion: 11*/

// Global stuff ////////////////////////////////////////////////////////

modules.codify = '2026-October-10f';

var SnapCodifier;
var CodePaneMorph;

// SnapCodifier ////////////////////////////////////////////////////////

SnapCodifier = {
    language: 'python',
    scope: 'sprite', // 'sprite' | 'all'
    _identCache: null,
    _customBackups: null,
    _multiArgMode: null, // temporarily overrides MultiArg join style
    _holeBindings: null, // Map<slotMorph, paramName> while mapping ring bodies

    languages: {
        python: {
            label: 'Python',
            ext: 'py',
            mime: 'text/x-python',
            comment: '#',
            indexBase: 0,
            emptyBody: 'pass',
            boolTrue: 'True',
            boolFalse: 'False',
            nullLit: 'None',
            andOp: 'and',
            orOp: 'or',
            notOp: 'not ',
            empty: '# Add blocks on the left to see your Python code here.\n',
            reserved: [
                'False', 'None', 'True', 'and', 'as', 'assert', 'async',
                'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
                'else', 'except', 'finally', 'for', 'from', 'global', 'if',
                'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
                'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
                'list', 'dict', 'str', 'int', 'float', 'type', 'id', 'input',
                'print', 'range', 'len', 'map', 'filter', 'sum', 'min', 'max',
                'snap'
            ]
        },
        javascript: {
            label: 'JavaScript',
            ext: 'js',
            mime: 'text/javascript',
            comment: '//',
            indexBase: 0,
            emptyBody: '/* empty */',
            boolTrue: 'true',
            boolFalse: 'false',
            nullLit: 'null',
            andOp: '&&',
            orOp: '||',
            notOp: '!',
            empty: '// Add blocks on the left to see your JavaScript code here.\n',
            reserved: [
                'break', 'case', 'catch', 'class', 'const', 'continue',
                'debugger', 'default', 'delete', 'do', 'else', 'export',
                'extends', 'finally', 'for', 'function', 'if', 'import',
                'in', 'instanceof', 'let', 'new', 'return', 'super',
                'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
                'while', 'with', 'yield', 'enum', 'await', 'null', 'true',
                'false', 'undefined', 'snap'
            ]
        },
        java: {
            label: 'Java',
            ext: 'java',
            mime: 'text/x-java-source',
            comment: '//',
            indexBase: 0,
            emptyBody: '/* empty */',
            boolTrue: 'true',
            boolFalse: 'false',
            nullLit: 'null',
            andOp: '&&',
            orOp: '||',
            notOp: '!',
            empty: '// Add blocks on the left to see your Java code here.\n',
            reserved: [
                'abstract', 'assert', 'boolean', 'break', 'byte', 'case',
                'catch', 'char', 'class', 'const', 'continue', 'default',
                'do', 'double', 'else', 'enum', 'extends', 'final',
                'finally', 'float', 'for', 'goto', 'if', 'implements',
                'import', 'instanceof', 'int', 'interface', 'long',
                'native', 'new', 'package', 'private', 'protected',
                'public', 'return', 'short', 'static', 'strictfp',
                'super', 'switch', 'synchronized', 'this', 'throw',
                'throws', 'transient', 'try', 'void', 'volatile', 'while',
                'true', 'false', 'null', 'snap'
            ]
        },
        lua: {
            label: 'Lua',
            ext: 'lua',
            mime: 'text/x-lua',
            comment: '--',
            indexBase: 1,
            emptyBody: '-- empty',
            boolTrue: 'true',
            boolFalse: 'false',
            nullLit: 'nil',
            andOp: 'and',
            orOp: 'or',
            notOp: 'not ',
            empty: '-- Add blocks on the left to see your Lua code here.\n',
            reserved: [
                'and', 'break', 'do', 'else', 'elseif', 'end', 'false',
                'for', 'function', 'goto', 'if', 'in', 'local', 'nil',
                'not', 'or', 'repeat', 'return', 'then', 'true', 'until',
                'while', 'snap'
            ]
        }
    }
};

SnapCodifier.profile = function () {
    return this.languages[this.language] || this.languages.python;
};

SnapCodifier.currentMeta = function () {
    return this.profile();
};

SnapCodifier.sanitizeIdentifier = function (raw) {
    return this.ident(raw);
};

// ---- naming: Snap allows spaces; text languages mostly don't --------

SnapCodifier.ident = function (raw) {
    var profile = this.profile(),
        name = (raw === null || raw === undefined) ? '' : String(raw),
        cacheKey = name + '\0' + this.language,
        cleaned,
        out,
        n,
        used;

    if (!this._identCache) { this._identCache = {}; }
    if (Object.prototype.hasOwnProperty.call(this._identCache, cacheKey)) {
        return this._identCache[cacheKey];
    }

    cleaned = name
        .replace(/['"]/g, '')
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

    if (!cleaned) {
        cleaned = 'value';
    }
    if (/^[0-9]/.test(cleaned)) {
        cleaned = 'n_' + cleaned;
    }
    if (profile.reserved.indexOf(cleaned) !== -1 ||
            profile.reserved.indexOf(cleaned.toLowerCase()) !== -1) {
        cleaned = cleaned + '_';
    }

    used = {};
    Object.keys(this._identCache).forEach(key => {
        if (key.endsWith('\0' + this.language)) {
            used[this._identCache[key]] = true;
        }
    });
    out = cleaned;
    n = 2;
    while (used[out]) {
        out = cleaned + '_' + n;
        n += 1;
    }
    this._identCache[cacheKey] = out;
    return out;
};

SnapCodifier.specToFunctionName = function (spec) {
    var words = String(spec || 'custom_block')
        .replace(/%'?[^%\s']+'?/g, ' ')
        .replace(/\$\w+/g, ' ')
        .replace(/[^A-Za-z0-9_]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) { words = ['custom_block']; }
    return this.ident(words.join('_'));
};

SnapCodifier.inputNamesOf = function (definition) {
    var names = [];
    if (!definition) { return names; }
    if (typeof definition.inputNames === 'function') {
        names = definition.inputNames();
    }
    if (definition.declarations && definition.declarations.size) {
        names = Array.from(definition.declarations.keys());
    }
    return names.map(n => this.ident(n));
};

SnapCodifier.quote = function (s) {
    var lang = this.language,
        t = String(s);
    if (lang === 'javascript') {
        return JSON.stringify(t);
    }
    return '"' + t.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
};

SnapCodifier.optionLiteral = function (val) {
    // Snap menu constants arrive as ['last'] / ['random'] / ...
    if (val instanceof Array) {
        return this.quote(String(val[0]));
    }
    if (typeof val === 'string' &&
            contains(
                ['last', 'any', 'random', 'all', 'parent', 'letter',
                    'whitespace', 'word', 'line', 'blocks'],
                val
            )) {
        return this.quote(val);
    }
    return null;
};

// ---- Snap runtime preludes (exported code dependency) -------------
SnapCodifier.runtimes = {
    python: `class _Snap:
    def __init__(self):
        self._vars = {}
        self._timer0 = 0.0
        self._answer = ""
        self.x = 0.0
        self.y = 0.0
        self.direction = 90.0
        self.size = 100.0
        self.shown = True
        self.pen_down = False
        self.pen_size = 1.0
        self.volume = 100.0
        self.tempo = 60.0
        self.costume_number = 1
        self._effects = {}
        self.hyperops = True

    # ---- indexing (Snap is 1-based; options: last/any/random/all/parent)
    def _len(self, xs):
        return len(xs) if xs is not None else 0

    def _resolve_index(self, xs, idx, *, for_insert=False, for_delete=False):
        n = self._len(xs)
        if isinstance(idx, str):
            key = idx
        else:
            key = None
        if key == "last":
            if for_insert:
                return n  # 0-based insert at end == len
            return n - 1 if n else 0
        if key == "any" or key == "random":
            import random as _r
            if n <= 0:
                return 0
            if for_insert:
                return _r.randint(0, n)
            return _r.randint(0, n - 1)
        if key == "all":
            return "all"
        if key == "parent":
            return "parent"
        try:
            i = int(idx)
        except Exception:
            return idx  # alphanumeric key
        # Snap 1-based -> Python 0-based
        return i - 1

    def item(self, idx, xs):
        if xs is None:
            return ""
        if idx == "" or idx is None:
            return ""
        i = self._resolve_index(xs, idx)
        if i == "all":
            return list(xs)
        if isinstance(i, str):
            return xs  # parent / key — best-effort
        if not xs:
            return ""
        if i < 0 or i >= len(xs):
            return ""
        return xs[i]

    def letter(self, idx, text):
        s = "" if text is None else str(text)
        return self.item(idx, list(s))

    def add(self, value, xs):
        xs.append(value)
        return xs

    def delete(self, idx, xs):
        i = self._resolve_index(xs, idx, for_delete=True)
        if i == "all":
            xs.clear()
            return xs
        if isinstance(i, int) and 0 <= i < len(xs):
            del xs[i]
        return xs

    def insert(self, value, idx, xs):
        i = self._resolve_index(xs, idx, for_insert=True)
        if isinstance(i, int):
            if i < 0:
                i = 0
            if i > len(xs):
                i = len(xs)
            xs.insert(i, value)
        return xs

    def replace(self, idx, xs, value):
        i = self._resolve_index(xs, idx)
        if isinstance(i, int) and 0 <= i < len(xs):
            xs[i] = value
        return xs

    def index_of(self, value, xs):
        try:
            return xs.index(value) + 1
        except Exception:
            return 0

    def contains(self, xs, value):
        return value in xs

    def is_empty(self, xs):
        return self._len(xs) == 0

    def length(self, xs):
        if isinstance(xs, str):
            return len(xs)
        return self._len(xs)

    def cons(self, value, xs):
        return [value] + list(xs)

    def cdr(self, xs):
        return list(xs)[1:]

    def numbers(self, a, b):
        return list(range(int(a), int(b) + 1))

    def append_lists(self, *lists):
        out = []
        for L in lists:
            out.extend(L)
        return out

    def join(self, *parts):
        return "".join("" if p is None else str(p) for p in parts)

    def split(self, text, delim):
        s = "" if text is None else str(text)
        if delim == "" or delim is None:
            return list(s)
        if isinstance(delim, str) and delim in ("letter", "whitespace", "word", "line"):
            if delim == "letter":
                return list(s)
            if delim == "whitespace":
                return s.split()
            if delim == "word":
                return s.split(" ")
            if delim == "line":
                return s.splitlines()
        return s.split(str(delim))

    # ---- variadic / hyper-friendly arithmetic
    def _atomic(self, op, a, b):
        if op == "+": return a + b
        if op == "-": return a - b
        if op == "*": return a * b
        if op == "/": return a / b if b != 0 else float("inf")
        if op == "mod": return a % b
        if op == "pow": return a ** b
        if op == "atan2":
            import math
            return math.atan2(a, b)
        if op == "=": return a == b
        if op == "!=": return a != b
        if op == "<": return a < b
        if op == "<=": return a <= b
        if op == ">": return a > b
        if op == ">=": return a >= b
        if op == "and": return bool(a) and bool(b)
        if op == "or": return bool(a) or bool(b)
        if op == "identical": return a is b
        raise ValueError(op)

    def _hyper(self, op, a, b):
        la = isinstance(a, (list, tuple))
        lb = isinstance(b, (list, tuple))
        if self.hyperops and (la or lb):
            if la and lb:
                n = max(len(a), len(b))
                return [self._hyper(op, a[i % len(a)], b[i % len(b)]) for i in range(n)] if a and b else []
            if la:
                return [self._hyper(op, x, b) for x in a]
            return [self._hyper(op, a, x) for x in b]
        return self._atomic(op, a, b)

    def sum(self, *args):
        if not args: return 0
        acc = args[0]
        for x in args[1:]:
            acc = self._hyper("+", acc, x)
        return acc

    def difference(self, a, b):
        return self._hyper("-", a, b)

    def product(self, *args):
        if not args: return 1
        acc = args[0]
        for x in args[1:]:
            acc = self._hyper("*", acc, x)
        return acc

    def quotient(self, a, b):
        return self._hyper("/", a, b)

    def mod(self, a, b):
        return self._hyper("mod", a, b)

    def power(self, a, b):
        return self._hyper("pow", a, b)

    def atan2(self, a, b):
        return self._hyper("atan2", a, b)

    def equals(self, *args):
        if len(args) < 2: return True
        acc = True
        for i in range(len(args) - 1):
            acc = acc and self._hyper("=", args[i], args[i + 1])
        return acc

    def not_equals(self, *args):
        return not self.equals(*args)

    def less(self, *args):
        if len(args) < 2: return True
        for i in range(len(args) - 1):
            if not self._hyper("<", args[i], args[i + 1]):
                return False
        return True

    def less_eq(self, *args):
        if len(args) < 2: return True
        for i in range(len(args) - 1):
            if not self._hyper("<=", args[i], args[i + 1]):
                return False
        return True

    def greater(self, *args):
        if len(args) < 2: return True
        for i in range(len(args) - 1):
            if not self._hyper(">", args[i], args[i + 1]):
                return False
        return True

    def greater_eq(self, *args):
        if len(args) < 2: return True
        for i in range(len(args) - 1):
            if not self._hyper(">=", args[i], args[i + 1]):
                return False
        return True

    def both(self, *args):
        return all(bool(x) for x in args)

    def either(self, *args):
        return any(bool(x) for x in args)

    def identical(self, *args):
        if len(args) < 2: return True
        for i in range(len(args) - 1):
            if args[i] is not args[i + 1]:
                return False
        return True

    def monadic(self, name, n):
        import math
        key = name[0] if isinstance(name, (list, tuple)) else name
        key = str(key)
        table = {
            "abs": abs, "neg": lambda x: -x,
            "ceiling": math.ceil, "floor": math.floor,
            "sqrt": math.sqrt,
            "sin": lambda x: math.sin(math.radians(x)),
            "cos": lambda x: math.cos(math.radians(x)),
            "tan": lambda x: math.tan(math.radians(x)),
            "asin": lambda x: math.degrees(math.asin(x)),
            "acos": lambda x: math.degrees(math.acos(x)),
            "atan": lambda x: math.degrees(math.atan(x)),
            "ln": math.log, "log": math.log10,
            "lg": math.log2 if hasattr(math, "log2") else (lambda x: math.log(x, 2)),
            "e^": math.exp, "10^": lambda x: 10 ** x,
            "2^": lambda x: 2 ** x,
            "id": lambda x: x,
            "round": round,
        }
        fn = table.get(key, table.get(key.lower()))
        if fn is None:
            return n
        if isinstance(n, (list, tuple)) and self.hyperops:
            return [self.monadic(key, x) for x in n]
        return fn(n)

    def round(self, n):
        return self.monadic("round", n)

    def random(self, a, b):
        import random as _r
        return _r.randint(int(a), int(b))

    def not_(self, b):
        return not b

    # ---- HOFs
    def map(self, ring, xs):
        return [ring(x) for x in xs]

    def keep(self, pred, xs):
        return [x for x in xs if pred(x)]

    def find_first(self, pred, xs):
        for x in xs:
            if pred(x):
                return x
        return None

    def combine(self, xs, ring):
        import functools
        return functools.reduce(ring, xs)

    def pipe(self, value, *rings):
        for r in rings:
            value = r(value)
        return value

    def call(self, ring, *args):
        return ring(*args)

    def run(self, ring, *args):
        return ring(*args)

    def launch(self, ring, *args):
        # best-effort: run immediately in exported code
        return ring(*args)

    def script(self, thunk):
        return thunk()

    # ---- motion / looks / sensing stubs (stage semantics)
    def move(self, steps):
        import math
        r = math.radians(90 - self.direction)
        self.x += steps * math.cos(r)
        self.y += steps * math.sin(r)

    def turn_right(self, deg): self.direction = (self.direction + deg) % 360
    def turn_left(self, deg): self.direction = (self.direction - deg) % 360
    def point_in_direction(self, deg): self.direction = deg
    def point_towards(self, _): pass
    def go_to(self, a=None, b=None):
        if b is None: return
        self.x, self.y = a, b
    def glide(self, *_): pass
    def change_x(self, n): self.x += n
    def set_x(self, n): self.x = n
    def change_y(self, n): self.y += n
    def set_y(self, n): self.y = n
    def if_on_edge_bounce(self): pass
    def position(self): return [self.x, self.y]
    def x_position(self): return self.x
    def y_position(self): return self.y
    def say(self, *args): print(*args)
    def think(self, *args): print(*args)
    def switch_costume(self, *_): pass
    def next_costume(self): self.costume_number += 1
    def change_effect(self, name, n): self._effects[name] = self._effects.get(name, 0) + n
    def set_effect(self, name, n): self._effects[name] = n
    def effect(self, name): return self._effects.get(name, 0)
    def clear_graphic_effects(self): self._effects.clear()
    def change_size(self, n): self.size += n
    def set_size(self, n): self.size = n
    def show(self): self.shown = True
    def hide(self): self.shown = False
    def is_shown(self): return self.shown
    def go_to_layer(self, *_): pass
    def go_back_layers(self, *_): pass
    def alert(self, *a): print(*a)
    def play_sound(self, *_): pass
    def play_sound_until_done(self, *_): pass
    def play_sound_at(self, *_): pass
    def stop_all_sounds(self): pass
    def rest(self, *_): pass
    def play_note(self, *_): pass
    def play_frequency(self, *_): pass
    def set_instrument(self, *_): pass
    def change_tempo(self, n): self.tempo += n
    def set_tempo(self, n): self.tempo = n
    def change_volume(self, n): self.volume += n
    def set_volume(self, n): self.volume = n
    def change_balance(self, *_): pass
    def set_balance(self, *_): pass
    def balance(self): return 0
    def stop_frequency(self): pass
    def clear(self): pass
    def pen_down_fn(self): self.pen_down = True
    def pen_up(self): self.pen_down = False
    def is_pen_down(self): return self.pen_down
    def set_pen_color(self, *_): pass
    def change_pen_size(self, n): self.pen_size += n
    def set_pen_size(self, n): self.pen_size = n
    def stamp(self): pass
    def fill(self): pass
    def write_pen(self, *_): pass
    def paste_on(self, *_): pass
    def cut_from(self, *_): pass
    def wait(self, secs):
        import time
        time.sleep(float(secs or 0))
    def wait_until(self, pred):
        import time
        while not pred():
            time.sleep(0.01)
    def broadcast(self, *_): pass
    def broadcast_and_wait(self, *_): pass
    def stop_all(self): raise SystemExit
    def create_clone(self, *_): pass
    def delete_this_clone(self): pass
    def pause_all(self): pass
    def ask(self, prompt):
        self._answer = input("" if prompt is None else str(prompt))
        return self._answer
    def answer(self): return self._answer
    def reset_timer(self):
        import time
        self._timer0 = time.time()
    def timer(self):
        import time
        return time.time() - self._timer0
    def touching(self, *_): return False
    def touching_color(self, *_): return False
    def color_is_touching(self, *_): return False
    def mouse_x(self): return 0
    def mouse_y(self): return 0
    def mouse_down(self): return False
    def mouse_position(self): return [0, 0]
    def key_pressed(self, *_): return False
    def attribute(self, *_): return None
    def object(self, *_): return None
    def http_get(self, url):
        try:
            from urllib.request import urlopen
            return urlopen(url).read().decode("utf-8", "replace")
        except Exception as e:
            return str(e)
    def current(self, *_): 
        import datetime
        return datetime.datetime.now().isoformat()
    def my(self, *_): return None
    def aspect(self, *_): return 0
    def relation(self, *_): return 0
    def microphone(self, *_): return 0
    def video(self, *_): return 0
    def show_variable(self, *_): pass
    def hide_variable(self, *_): pass
    def tell(self, *_): pass
    def ask_for(self, target, ring, *args): return ring(*args)
    def new_clone(self, *_): return None
    def switch_scene(self, *_): pass
    def unicode_of(self, t): return ord(str(t)[0]) if t not in (None, "") else 0
    def unicode_as_letter(self, n): return chr(int(n))
    def is_a(self, v, typ):
        key = typ[0] if isinstance(typ, (list, tuple)) else typ
        key = str(key).lower()
        if key in ("number", "num"): return isinstance(v, (int, float)) and not isinstance(v, bool)
        if key in ("text", "string"): return isinstance(v, str)
        if key == "list": return isinstance(v, list)
        if key == "boolean": return isinstance(v, bool)
        return True
    def type_of(self, v):
        if isinstance(v, bool): return "boolean"
        if isinstance(v, (int, float)): return "number"
        if isinstance(v, str): return "text"
        if isinstance(v, list): return "list"
        return type(v).__name__
    def list_attribute(self, choice, xs):
        key = choice[0] if isinstance(choice, (list, tuple)) else choice
        if str(key) == "length": return self.length(xs)
        if str(key) == "rank": return 1
        return self.length(xs)
    def text_attribute(self, choice, text):
        return self.length(text)
    def min(self, *args): return min(args)
    def max(self, *args): return max(args)
    def hyper_zip(self, *args): return list(args)
    def __getattr__(self, name):
        # pen_hue / set_pen_* dynamic
        def _fn(*a, **k):
            return None
        return _fn

snap = _Snap()
`,
    javascript: `const snap = (() => {
  const S = {
    x: 0, y: 0, direction: 90, size: 100, shown: true,
    pen_down: false, pen_size: 1, volume: 100, tempo: 60,
    costume_number: 1, _answer: "", _timer0: 0, hyperops: true, _effects: {},
    _len(xs) { return xs == null ? 0 : xs.length; },
    _key(idx) {
      if (Array.isArray(idx)) return String(idx[0]);
      if (typeof idx === "string") return idx;
      return null;
    },
    _resolve(xs, idx, {insert=false}={}) {
      const n = this._len(xs);
      const key = this._key(idx);
      if (key === "last") return insert ? n : Math.max(0, n - 1);
      if (key === "any" || key === "random") {
        if (n <= 0) return 0;
        return insert ? Math.floor(Math.random() * (n + 1))
                      : Math.floor(Math.random() * n);
      }
      if (key === "all") return "all";
      if (key === "parent") return "parent";
      const i = Number(idx);
      if (!Number.isFinite(i)) return idx;
      return i - 1; // Snap 1-based → 0-based
    },
    item(idx, xs) {
      if (xs == null || idx === "" || idx == null) return "";
      const i = this._resolve(xs, idx);
      if (i === "all") return xs.slice();
      if (typeof i !== "number" || i < 0 || i >= xs.length) return "";
      return xs[i];
    },
    letter(idx, text) { return this.item(idx, Array.from(String(text ?? ""))); },
    add(v, xs) { xs.push(v); return xs; },
    delete(idx, xs) {
      const i = this._resolve(xs, idx);
      if (i === "all") { xs.length = 0; return xs; }
      if (typeof i === "number") xs.splice(i, 1);
      return xs;
    },
    insert(v, idx, xs) {
      let i = this._resolve(xs, idx, {insert: true});
      if (typeof i === "number") xs.splice(Math.max(0, Math.min(i, xs.length)), 0, v);
      return xs;
    },
    replace(idx, xs, v) {
      const i = this._resolve(xs, idx);
      if (typeof i === "number" && i >= 0 && i < xs.length) xs[i] = v;
      return xs;
    },
    index_of(v, xs) { const i = xs.indexOf(v); return i < 0 ? 0 : i + 1; },
    contains(xs, v) { return xs.includes(v); },
    is_empty(xs) { return this._len(xs) === 0; },
    length(xs) { return typeof xs === "string" ? xs.length : this._len(xs); },
    cons(v, xs) { return [v, ...xs]; },
    cdr(xs) { return xs.slice(1); },
    numbers(a, b) {
      const out = [];
      for (let i = Number(a); i <= Number(b); i++) out.push(i);
      return out;
    },
    append_lists(...lists) { return lists.flat(); },
    join(...parts) { return parts.map(p => p == null ? "" : String(p)).join(""); },
    split(text, delim) {
      const s = String(text ?? "");
      const d = Array.isArray(delim) ? delim[0] : delim;
      if (d === "letter") return Array.from(s);
      if (d === "whitespace") return s.trim() ? s.trim().split(/\\s+/) : [];
      if (d === "word") return s.split(" ");
      if (d === "line") return s.split(/\\r?\\n/);
      if (d == null || d === "") return Array.from(s);
      return s.split(String(d));
    },
    _atomic(op, a, b) {
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "mod": return a % b;
        case "pow": return a ** b;
        case "atan2": return Math.atan2(a, b);
        case "=": return a === b || a == b;
        case "!=": return a !== b && a != b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
        case "and": return !!(a && b);
        case "or": return !!(a || b);
        case "identical": return a === b;
        default: return null;
      }
    },
    _hyper(op, a, b) {
      const la = Array.isArray(a), lb = Array.isArray(b);
      if (this.hyperops && (la || lb)) {
        if (la && lb) {
          if (!a.length || !b.length) return [];
          const n = Math.max(a.length, b.length);
          return Array.from({length: n}, (_, i) =>
            this._hyper(op, a[i % a.length], b[i % b.length]));
        }
        if (la) return a.map(x => this._hyper(op, x, b));
        return b.map(x => this._hyper(op, a, x));
      }
      return this._atomic(op, a, b);
    },
    sum(...args) { return args.reduce((a, b) => this._hyper("+", a, b)); },
    difference(a, b) { return this._hyper("-", a, b); },
    product(...args) { return args.reduce((a, b) => this._hyper("*", a, b)); },
    quotient(a, b) { return this._hyper("/", a, b); },
    mod(a, b) { return this._hyper("mod", a, b); },
    power(a, b) { return this._hyper("pow", a, b); },
    atan2(a, b) { return this._hyper("atan2", a, b); },
    equals(...args) {
      for (let i = 0; i < args.length - 1; i++)
        if (!this._hyper("=", args[i], args[i + 1])) return false;
      return true;
    },
    not_equals(...args) { return !this.equals(...args); },
    less(...args) {
      for (let i = 0; i < args.length - 1; i++)
        if (!this._hyper("<", args[i], args[i + 1])) return false;
      return true;
    },
    less_eq(...args) {
      for (let i = 0; i < args.length - 1; i++)
        if (!this._hyper("<=", args[i], args[i + 1])) return false;
      return true;
    },
    greater(...args) {
      for (let i = 0; i < args.length - 1; i++)
        if (!this._hyper(">", args[i], args[i + 1])) return false;
      return true;
    },
    greater_eq(...args) {
      for (let i = 0; i < args.length - 1; i++)
        if (!this._hyper(">=", args[i], args[i + 1])) return false;
      return true;
    },
    both(...args) { return args.every(Boolean); },
    either(...args) { return args.some(Boolean); },
    identical(...args) {
      for (let i = 0; i < args.length - 1; i++) if (args[i] !== args[i + 1]) return false;
      return true;
    },
    monadic(name, n) {
      const key = String(Array.isArray(name) ? name[0] : name);
      const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
      const table = {
        abs: Math.abs, neg: x => -x, ceiling: Math.ceil, floor: Math.floor,
        sqrt: Math.sqrt, sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)),
        tan: x => Math.tan(rad(x)), asin: x => deg(Math.asin(x)),
        acos: x => deg(Math.acos(x)), atan: x => deg(Math.atan(x)),
        ln: Math.log, log: Math.log10, lg: Math.log2,
        "e^": Math.exp, "10^": x => 10 ** x, "2^": x => 2 ** x,
        id: x => x, round: Math.round
      };
      const fn = table[key];
      if (!fn) return n;
      if (Array.isArray(n) && this.hyperops) return n.map(x => this.monadic(key, x));
      return fn(n);
    },
    round(n) { return this.monadic("round", n); },
    random(a, b) {
      a = Number(a); b = Number(b);
      return a + Math.floor(Math.random() * (b - a + 1));
    },
    not_(b) { return !b; },
    map(ring, xs) { return xs.map(x => ring(x)); },
    keep(pred, xs) { return xs.filter(x => pred(x)); },
    find_first(pred, xs) { return xs.find(x => pred(x)); },
    combine(xs, ring) { return xs.reduce((a, b) => ring(a, b)); },
    pipe(value, ...rings) { return rings.reduce((v, r) => r(v), value); },
    call(ring, ...args) { return ring(...args); },
    run(ring, ...args) { return ring(...args); },
    launch(ring, ...args) { queueMicrotask(() => ring(...args)); },
    script(thunk) { return thunk(); },
    move(steps) {
      const r = (90 - this.direction) * Math.PI / 180;
      this.x += steps * Math.cos(r); this.y += steps * Math.sin(r);
    },
    turn_right(d) { this.direction = (this.direction + d) % 360; },
    turn_left(d) { this.direction = (this.direction - d) % 360; },
    point_in_direction(d) { this.direction = d; },
    point_towards() {},
    go_to(a, b) { if (b != null) { this.x = a; this.y = b; } },
    glide() {}, change_x(n) { this.x += n; }, set_x(n) { this.x = n; },
    change_y(n) { this.y += n; }, set_y(n) { this.y = n; },
    if_on_edge_bounce() {}, position() { return [this.x, this.y]; },
    x_position() { return this.x; }, y_position() { return this.y; },
    say(...a) { console.log(...a); }, think(...a) { console.log(...a); },
    switch_costume() {}, next_costume() { this.costume_number++; },
    change_effect(name, n) { this._effects[name] = (this._effects[name] || 0) + n; },
    set_effect(name, n) { this._effects[name] = n; },
    effect(name) { return this._effects[name] || 0; },
    clear_graphic_effects() { this._effects = {}; },
    change_size(n) { this.size += n; }, set_size(n) { this.size = n; },
    show() { this.shown = true; }, hide() { this.shown = false; },
    is_shown() { return this.shown; },
    go_to_layer() {}, go_back_layers() {}, alert(...a) { console.log(...a); },
    play_sound() {}, play_sound_until_done() {}, play_sound_at() {},
    stop_all_sounds() {}, rest() {}, play_note() {}, play_frequency() {},
    set_instrument() {}, change_tempo(n) { this.tempo += n; }, set_tempo(n) { this.tempo = n; },
    change_volume(n) { this.volume += n; }, set_volume(n) { this.volume = n; },
    change_balance() {}, set_balance() {}, balance() { return 0; }, stop_frequency() {},
    clear() {}, pen_down_fn() { this.pen_down = true; }, pen_up() { this.pen_down = false; },
    is_pen_down() { return this.pen_down; }, set_pen_color() {},
    change_pen_size(n) { this.pen_size += n; }, set_pen_size(n) { this.pen_size = n; },
    stamp() {}, fill() {}, write_pen() {}, paste_on() {}, cut_from() {},
    async wait(secs) { await new Promise(r => setTimeout(r, (Number(secs) || 0) * 1000)); },
    async wait_until(pred) { while (!pred()) await this.wait(0.01); },
    broadcast() {}, async broadcast_and_wait() {},
    stop_all() { throw new Error("stop all"); },
    create_clone() {}, delete_this_clone() {}, pause_all() {},
    async ask(prompt) {
      this._answer = (typeof globalThis.prompt === "function")
        ? (globalThis.prompt(String(prompt ?? "")) || "") : "";
      return this._answer;
    },
    answer() { return this._answer; },
    reset_timer() { this._timer0 = Date.now(); },
    timer() { return (Date.now() - this._timer0) / 1000; },
    touching() { return false; }, touching_color() { return false; },
    color_is_touching() { return false; },
    mouse_x() { return 0; }, mouse_y() { return 0; }, mouse_down() { return false; },
    mouse_position() { return [0, 0]; }, key_pressed() { return false; },
    attribute() { return null; }, object() { return null; },
    async http_get(url) { const r = await fetch(url); return r.text(); },
    current() { return new Date().toISOString(); },
    my() { return null; }, aspect() { return 0; }, relation() { return 0; },
    microphone() { return 0; }, video() { return 0; },
    show_variable() {}, hide_variable() {}, tell() {},
    ask_for(_t, ring, ...args) { return ring(...args); },
    new_clone() { return null; }, switch_scene() {},
    unicode_of(t) { return String(t ?? "").charCodeAt(0) || 0; },
    unicode_as_letter(n) { return String.fromCharCode(Number(n)); },
    is_a(v, typ) {
      const key = String(Array.isArray(typ) ? typ[0] : typ).toLowerCase();
      if (key === "number") return typeof v === "number";
      if (key === "text") return typeof v === "string";
      if (key === "list") return Array.isArray(v);
      if (key === "boolean") return typeof v === "boolean";
      return true;
    },
    type_of(v) {
      if (typeof v === "boolean") return "boolean";
      if (typeof v === "number") return "number";
      if (typeof v === "string") return "text";
      if (Array.isArray(v)) return "list";
      return typeof v;
    },
    list_attribute(choice, xs) {
      const key = String(Array.isArray(choice) ? choice[0] : choice);
      return key === "length" ? this.length(xs) : this.length(xs);
    },
    text_attribute(_c, text) { return this.length(text); },
    min(...args) { return Math.min(...args); },
    max(...args) { return Math.max(...args); },
    hyper_zip(...args) { return args; }
  };
  return new Proxy(S, {
    get(t, p) { return p in t ? t[p] : (..._a) => null; }
  });
})();
`,
    lua: `local snap = {}
snap.x, snap.y, snap.direction, snap.size = 0, 0, 90, 100
snap.shown, snap.pen_down, snap.pen_size = true, false, 1
snap.volume, snap.tempo, snap.costume_number = 100, 60, 1
snap._answer, snap._timer0, snap.hyperops = "", os.clock(), true
snap._effects = {}

function snap._len(xs) return xs and #xs or 0 end
function snap._key(idx)
  if type(idx) == "table" then return tostring(idx[1]) end
  if type(idx) == "string" then return idx end
  return nil
end
function snap._resolve(xs, idx, insert)
  local n = snap._len(xs)
  local key = snap._key(idx)
  if key == "last" then return insert and (n + 1) or n end
  if key == "any" or key == "random" then
    if n <= 0 then return 1 end
    if insert then return math.random(1, n + 1) end
    return math.random(1, n)
  end
  if key == "all" then return "all" end
  if key == "parent" then return "parent" end
  local i = tonumber(idx)
  if not i then return idx end
  return i -- Lua/Snap both 1-based
end
function snap.item(idx, xs)
  if xs == nil or idx == "" or idx == nil then return "" end
  local i = snap._resolve(xs, idx, false)
  if i == "all" then
    local t = {}
    for k, v in ipairs(xs) do t[k] = v end
    return t
  end
  if type(i) ~= "number" then return "" end
  return xs[i] or ""
end
function snap.letter(idx, text)
  text = tostring(text or "")
  local t = {}
  for i = 1, #text do t[i] = text:sub(i, i) end
  return snap.item(idx, t)
end
function snap.add(v, xs) table.insert(xs, v); return xs end
function snap.delete(idx, xs)
  local i = snap._resolve(xs, idx, false)
  if i == "all" then for j = #xs, 1, -1 do xs[j] = nil end; return xs end
  if type(i) == "number" then table.remove(xs, i) end
  return xs
end
function snap.insert(v, idx, xs)
  local i = snap._resolve(xs, idx, true)
  if type(i) == "number" then table.insert(xs, i, v) end
  return xs
end
function snap.replace(idx, xs, v)
  local i = snap._resolve(xs, idx, false)
  if type(i) == "number" then xs[i] = v end
  return xs
end
function snap.index_of(v, xs)
  for i, x in ipairs(xs) do if x == v then return i end end
  return 0
end
function snap.contains(xs, v)
  for _, x in ipairs(xs) do if x == v then return true end end
  return false
end
function snap.is_empty(xs) return snap._len(xs) == 0 end
function snap.length(xs)
  if type(xs) == "string" then return #xs end
  return snap._len(xs)
end
function snap.cons(v, xs)
  local t = {v}
  for i = 1, #xs do t[i + 1] = xs[i] end
  return t
end
function snap.cdr(xs)
  local t = {}
  for i = 2, #xs do t[#t + 1] = xs[i] end
  return t
end
function snap.numbers(a, b)
  local t = {}
  for i = a, b do t[#t + 1] = i end
  return t
end
function snap.append_lists(...)
  local t = {}
  for _, L in ipairs({...}) do for _, v in ipairs(L) do t[#t + 1] = v end end
  return t
end
function snap.join(...)
  local parts = {...}
  for i = 1, #parts do parts[i] = tostring(parts[i] or "") end
  return table.concat(parts)
end
function snap.split(text, delim)
  local s = tostring(text or "")
  local d = type(delim) == "table" and delim[1] or delim
  local t = {}
  if d == "letter" or d == "" or d == nil then
    for i = 1, #s do t[i] = s:sub(i, i) end
    return t
  end
  if d == "line" then
    for line in string.gmatch(s .. "\\n", "(.-)\\n") do t[#t + 1] = line end
    return t
  end
  d = tostring(d)
  local pat = "(.-)" .. d:gsub("(%W)", "%%%1")
  for part in string.gmatch(s .. d, pat) do t[#t + 1] = part end
  return t
end
function snap._atomic(op, a, b)
  if op == "+" then return a + b end
  if op == "-" then return a - b end
  if op == "*" then return a * b end
  if op == "/" then return a / b end
  if op == "mod" then return a % b end
  if op == "pow" then return a ^ b end
  if op == "atan2" then return math.atan(a, b) end
  if op == "=" then return a == b end
  if op == "!=" then return a ~= b end
  if op == "<" then return a < b end
  if op == "<=" then return a <= b end
  if op == ">" then return a > b end
  if op == ">=" then return a >= b end
  if op == "and" then return a and b end
  if op == "or" then return a or b end
  if op == "identical" then return rawequal(a, b) end
end
function snap._hyper(op, a, b)
  local la, lb = type(a) == "table", type(b) == "table"
  if snap.hyperops and (la or lb) then
    if la and lb then
      local n = math.max(#a, #b)
      local t = {}
      if #a == 0 or #b == 0 then return t end
      for i = 1, n do
        t[i] = snap._hyper(op, a[((i - 1) % #a) + 1], b[((i - 1) % #b) + 1])
      end
      return t
    end
    if la then
      local t = {}
      for i, x in ipairs(a) do t[i] = snap._hyper(op, x, b) end
      return t
    end
    local t = {}
    for i, x in ipairs(b) do t[i] = snap._hyper(op, a, x) end
    return t
  end
  return snap._atomic(op, a, b)
end
function snap.sum(...) local a = {...}; local acc = a[1] or 0; for i = 2, #a do acc = snap._hyper("+", acc, a[i]) end; return acc end
function snap.difference(a, b) return snap._hyper("-", a, b) end
function snap.product(...) local a = {...}; local acc = a[1] or 1; for i = 2, #a do acc = snap._hyper("*", acc, a[i]) end; return acc end
function snap.quotient(a, b) return snap._hyper("/", a, b) end
function snap.mod(a, b) return snap._hyper("mod", a, b) end
function snap.power(a, b) return snap._hyper("pow", a, b) end
function snap.atan2(a, b) return snap._hyper("atan2", a, b) end
function snap.equals(...)
  local a = {...}
  for i = 1, #a - 1 do if not snap._hyper("=", a[i], a[i + 1]) then return false end end
  return true
end
function snap.not_equals(...) return not snap.equals(...) end
function snap.less(...)
  local a = {...}
  for i = 1, #a - 1 do if not snap._hyper("<", a[i], a[i + 1]) then return false end end
  return true
end
function snap.less_eq(...)
  local a = {...}
  for i = 1, #a - 1 do if not snap._hyper("<=", a[i], a[i + 1]) then return false end end
  return true
end
function snap.greater(...)
  local a = {...}
  for i = 1, #a - 1 do if not snap._hyper(">", a[i], a[i + 1]) then return false end end
  return true
end
function snap.greater_eq(...)
  local a = {...}
  for i = 1, #a - 1 do if not snap._hyper(">=", a[i], a[i + 1]) then return false end end
  return true
end
function snap.both(...) for _, x in ipairs({...}) do if not x then return false end end; return true end
function snap.either(...) for _, x in ipairs({...}) do if x then return true end end; return false end
function snap.identical(...)
  local a = {...}
  for i = 1, #a - 1 do if not rawequal(a[i], a[i + 1]) then return false end end
  return true
end
function snap.monadic(name, n)
  local key = type(name) == "table" and tostring(name[1]) or tostring(name)
  local function one(x)
    if key == "abs" then return math.abs(x) end
    if key == "neg" then return -x end
    if key == "ceiling" then return math.ceil(x) end
    if key == "floor" then return math.floor(x) end
    if key == "sqrt" then return math.sqrt(x) end
    if key == "sin" then return math.sin(math.rad(x)) end
    if key == "cos" then return math.cos(math.rad(x)) end
    if key == "tan" then return math.tan(math.rad(x)) end
    if key == "asin" then return math.deg(math.asin(x)) end
    if key == "acos" then return math.deg(math.acos(x)) end
    if key == "atan" then return math.deg(math.atan(x)) end
    if key == "ln" then return math.log(x) end
    if key == "log" then return math.log(x, 10) end
    if key == "e^" then return math.exp(x) end
    if key == "10^" then return 10 ^ x end
    if key == "2^" then return 2 ^ x end
    if key == "round" then return math.floor(x + 0.5) end
    return x
  end
  if type(n) == "table" and snap.hyperops then
    local t = {}
    for i, x in ipairs(n) do t[i] = one(x) end
    return t
  end
  return one(n)
end
function snap.round(n) return snap.monadic("round", n) end
function snap.random(a, b) return math.random(tonumber(a), tonumber(b)) end
function snap.not_(b) return not b end
function snap.map(ring, xs) local t = {}; for i, x in ipairs(xs) do t[i] = ring(x) end; return t end
function snap.keep(pred, xs) local t = {}; for _, x in ipairs(xs) do if pred(x) then t[#t + 1] = x end end; return t end
function snap.find_first(pred, xs) for _, x in ipairs(xs) do if pred(x) then return x end end; return nil end
function snap.combine(xs, ring) local acc = xs[1]; for i = 2, #xs do acc = ring(acc, xs[i]) end; return acc end
function snap.pipe(value, ...) for _, r in ipairs({...}) do value = r(value) end; return value end
function snap.call(ring, ...) return ring(...) end
function snap.run(ring, ...) return ring(...) end
function snap.launch(ring, ...) return ring(...) end
function snap.script(thunk) return thunk() end
function snap.move(steps)
  local r = math.rad(90 - snap.direction)
  snap.x = snap.x + steps * math.cos(r)
  snap.y = snap.y + steps * math.sin(r)
end
function snap.turn_right(d) snap.direction = (snap.direction + d) % 360 end
function snap.turn_left(d) snap.direction = (snap.direction - d) % 360 end
function snap.point_in_direction(d) snap.direction = d end
function snap.point_towards() end
function snap.go_to(a, b) if b ~= nil then snap.x, snap.y = a, b end end
function snap.glide() end
function snap.change_x(n) snap.x = snap.x + n end
function snap.set_x(n) snap.x = n end
function snap.change_y(n) snap.y = snap.y + n end
function snap.set_y(n) snap.y = n end
function snap.if_on_edge_bounce() end
function snap.position() return {snap.x, snap.y} end
function snap.x_position() return snap.x end
function snap.y_position() return snap.y end
function snap.say(...) print(...) end
function snap.think(...) print(...) end
function snap.switch_costume() end
function snap.next_costume() snap.costume_number = snap.costume_number + 1 end
function snap.change_effect(name, n) snap._effects[name] = (snap._effects[name] or 0) + n end
function snap.set_effect(name, n) snap._effects[name] = n end
function snap.effect(name) return snap._effects[name] or 0 end
function snap.clear_graphic_effects() snap._effects = {} end
function snap.change_size(n) snap.size = snap.size + n end
function snap.set_size(n) snap.size = n end
function snap.show() snap.shown = true end
function snap.hide() snap.shown = false end
function snap.is_shown() return snap.shown end
function snap.go_to_layer() end
function snap.go_back_layers() end
function snap.alert(...) print(...) end
function snap.play_sound() end
function snap.play_sound_until_done() end
function snap.play_sound_at() end
function snap.stop_all_sounds() end
function snap.rest() end
function snap.play_note() end
function snap.play_frequency() end
function snap.set_instrument() end
function snap.change_tempo(n) snap.tempo = snap.tempo + n end
function snap.set_tempo(n) snap.tempo = n end
function snap.change_volume(n) snap.volume = snap.volume + n end
function snap.set_volume(n) snap.volume = n end
function snap.change_balance() end
function snap.set_balance() end
function snap.balance() return 0 end
function snap.stop_frequency() end
function snap.clear() end
function snap.pen_down_fn() snap.pen_down = true end
function snap.pen_up() snap.pen_down = false end
function snap.is_pen_down() return snap.pen_down end
function snap.set_pen_color() end
function snap.change_pen_size(n) snap.pen_size = snap.pen_size + n end
function snap.set_pen_size(n) snap.pen_size = n end
function snap.stamp() end
function snap.fill() end
function snap.write_pen() end
function snap.paste_on() end
function snap.cut_from() end
function snap.wait(secs) local t0 = os.clock(); while os.clock() - t0 < (tonumber(secs) or 0) do end end
function snap.wait_until(pred) while not pred() do snap.wait(0.01) end end
function snap.broadcast() end
function snap.broadcast_and_wait() end
function snap.stop_all() error("stop all") end
function snap.create_clone() end
function snap.delete_this_clone() end
function snap.pause_all() end
function snap.ask(prompt) io.write(tostring(prompt or "")); snap._answer = io.read() or ""; return snap._answer end
function snap.answer() return snap._answer end
function snap.reset_timer() snap._timer0 = os.clock() end
function snap.timer() return os.clock() - snap._timer0 end
function snap.touching() return false end
function snap.touching_color() return false end
function snap.color_is_touching() return false end
function snap.mouse_x() return 0 end
function snap.mouse_y() return 0 end
function snap.mouse_down() return false end
function snap.mouse_position() return {0, 0} end
function snap.key_pressed() return false end
function snap.attribute() return nil end
function snap.object() return nil end
function snap.http_get(url) return "" end
function snap.current() return os.date("!%Y-%m-%dT%H:%M:%SZ") end
function snap.my() return nil end
function snap.aspect() return 0 end
function snap.relation() return 0 end
function snap.microphone() return 0 end
function snap.video() return 0 end
function snap.show_variable() end
function snap.hide_variable() end
function snap.tell() end
function snap.ask_for(_, ring, ...) return ring(...) end
function snap.new_clone() return nil end
function snap.switch_scene() end
function snap.unicode_of(t) return string.byte(tostring(t or ""), 1) or 0 end
function snap.unicode_as_letter(n) return string.char(tonumber(n) or 0) end
function snap.is_a(v, typ)
  local key = type(typ) == "table" and tostring(typ[1]) or tostring(typ)
  key = string.lower(key)
  if key == "number" then return type(v) == "number" end
  if key == "text" then return type(v) == "string" end
  if key == "list" then return type(v) == "table" end
  if key == "boolean" then return type(v) == "boolean" end
  return true
end
function snap.type_of(v)
  if type(v) == "boolean" then return "boolean" end
  if type(v) == "number" then return "number" end
  if type(v) == "string" then return "text" end
  if type(v) == "table" then return "list" end
  return type(v)
end
function snap.list_attribute(choice, xs) return snap.length(xs) end
function snap.text_attribute(_, text) return snap.length(text) end
function snap.min(...) return math.min(...) end
function snap.max(...) return math.max(...) end
function snap.hyper_zip(...) return {...} end
setmetatable(snap, {__index = function() return function() return nil end end})
`,
    java: `import java.util.*;
import java.util.function.*;
import java.util.concurrent.*;

class Snap {
    double x = 0, y = 0, direction = 90, size = 100, pen_size = 1, volume = 100, tempo = 60;
    boolean shown = true, pen_down = false, hyperops = true;
    int costume_number = 1;
    String _answer = "";
    long _timer0 = System.currentTimeMillis();
    Map<String, Double> _effects = new HashMap<>();

    static String keyOf(Object idx) {
        if (idx instanceof List && !((List<?>) idx).isEmpty())
            return String.valueOf(((List<?>) idx).get(0));
        if (idx instanceof String) return (String) idx;
        return null;
    }
    int resolve(List<?> xs, Object idx, boolean insert) {
        int n = xs == null ? 0 : xs.size();
        String key = keyOf(idx);
        if ("last".equals(key)) return insert ? n : Math.max(0, n - 1);
        if ("any".equals(key) || "random".equals(key)) {
            if (n <= 0) return 0;
            return insert ? ThreadLocalRandom.current().nextInt(n + 1)
                          : ThreadLocalRandom.current().nextInt(n);
        }
        if ("all".equals(key)) return -2;
        try { return ((Number) Double.valueOf(String.valueOf(idx))).intValue() - 1; }
        catch (Exception e) { return -1; }
    }
    Object item(Object idx, List<?> xs) {
        if (xs == null || idx == null || "".equals(idx)) return "";
        int i = resolve(xs, idx, false);
        if (i == -2) return new ArrayList<>(xs);
        if (i < 0 || i >= xs.size()) return "";
        return xs.get(i);
    }
    Object letter(Object idx, Object text) {
        String s = text == null ? "" : String.valueOf(text);
        List<String> chars = new ArrayList<>();
        for (int i = 0; i < s.length(); i++) chars.add(String.valueOf(s.charAt(i)));
        return item(idx, chars);
    }
    <T> List<T> add(T v, List<T> xs) { xs.add(v); return xs; }
    <T> List<T> delete(Object idx, List<T> xs) {
        int i = resolve(xs, idx, false);
        if (i == -2) { xs.clear(); return xs; }
        if (i >= 0 && i < xs.size()) xs.remove(i);
        return xs;
    }
    <T> List<T> insert(T v, Object idx, List<T> xs) {
        int i = resolve(xs, idx, true);
        if (i < 0) i = 0;
        if (i > xs.size()) i = xs.size();
        xs.add(i, v);
        return xs;
    }
    <T> List<T> replace(Object idx, List<T> xs, T v) {
        int i = resolve(xs, idx, false);
        if (i >= 0 && i < xs.size()) xs.set(i, v);
        return xs;
    }
    int index_of(Object v, List<?> xs) { int i = xs.indexOf(v); return i < 0 ? 0 : i + 1; }
    boolean contains(List<?> xs, Object v) { return xs.contains(v); }
    boolean is_empty(List<?> xs) { return xs == null || xs.isEmpty(); }
    int length(Object xs) {
        if (xs instanceof String) return ((String) xs).length();
        if (xs instanceof List) return ((List<?>) xs).size();
        return 0;
    }
    <T> List<T> cons(T v, List<T> xs) {
        List<T> out = new ArrayList<>(); out.add(v); out.addAll(xs); return out;
    }
    <T> List<T> cdr(List<T> xs) { return xs.size() <= 1 ? new ArrayList<>() : new ArrayList<>(xs.subList(1, xs.size())); }
    List<Integer> numbers(Object a, Object b) {
        List<Integer> out = new ArrayList<>();
        int aa = ((Number) a).intValue(), bb = ((Number) b).intValue();
        for (int i = aa; i <= bb; i++) out.add(i);
        return out;
    }
    @SafeVarargs final <T> List<T> append_lists(List<T>... lists) {
        List<T> out = new ArrayList<>();
        for (List<T> L : lists) out.addAll(L);
        return out;
    }
    String join(Object... parts) {
        StringBuilder sb = new StringBuilder();
        for (Object p : parts) sb.append(p == null ? "" : String.valueOf(p));
        return sb.toString();
    }
    List<String> split(Object text, Object delim) {
        String s = text == null ? "" : String.valueOf(text);
        String d = delim instanceof List ? String.valueOf(((List<?>) delim).get(0)) : String.valueOf(delim);
        if ("letter".equals(d) || d == null || "null".equals(d) || d.isEmpty()) {
            List<String> out = new ArrayList<>();
            for (int i = 0; i < s.length(); i++) out.add(String.valueOf(s.charAt(i)));
            return out;
        }
        if ("line".equals(d)) return Arrays.asList(s.split("\\\\R", -1));
        if ("whitespace".equals(d)) return s.trim().isEmpty() ? List.of() : Arrays.asList(s.trim().split("\\\\s+"));
        return Arrays.asList(s.split(java.util.regex.Pattern.quote(d), -1));
    }
    Object _atomic(String op, Object a, Object b) {
        double aa = a instanceof Number ? ((Number) a).doubleValue() : 0;
        double bb = b instanceof Number ? ((Number) b).doubleValue() : 0;
        switch (op) {
            case "+": return aa + bb;
            case "-": return aa - bb;
            case "*": return aa * bb;
            case "/": return aa / bb;
            case "mod": return aa % bb;
            case "pow": return Math.pow(aa, bb);
            case "atan2": return Math.atan2(aa, bb);
            case "=": return Objects.equals(a, b);
            case "!=": return !Objects.equals(a, b);
            case "<": return aa < bb;
            case "<=": return aa <= bb;
            case ">": return aa > bb;
            case ">=": return aa >= bb;
            case "and": return asBool(a) && asBool(b);
            case "or": return asBool(a) || asBool(b);
            case "identical": return a == b;
            default: return null;
        }
    }
    boolean asBool(Object v) {
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof Number) return ((Number) v).doubleValue() != 0;
        return v != null;
    }
    @SuppressWarnings("unchecked")
    Object _hyper(String op, Object a, Object b) {
        boolean la = a instanceof List, lb = b instanceof List;
        if (hyperops && (la || lb)) {
            if (la && lb) {
                List<?> A = (List<?>) a, B = (List<?>) b;
                if (A.isEmpty() || B.isEmpty()) return new ArrayList<>();
                int n = Math.max(A.size(), B.size());
                List<Object> out = new ArrayList<>();
                for (int i = 0; i < n; i++)
                    out.add(_hyper(op, A.get(i % A.size()), B.get(i % B.size())));
                return out;
            }
            if (la) {
                List<Object> out = new ArrayList<>();
                for (Object x : (List<?>) a) out.add(_hyper(op, x, b));
                return out;
            }
            List<Object> out = new ArrayList<>();
            for (Object x : (List<?>) b) out.add(_hyper(op, a, x));
            return out;
        }
        return _atomic(op, a, b);
    }
    Object sum(Object... args) {
        Object acc = args.length == 0 ? 0 : args[0];
        for (int i = 1; i < args.length; i++) acc = _hyper("+", acc, args[i]);
        return acc;
    }
    Object difference(Object a, Object b) { return _hyper("-", a, b); }
    Object product(Object... args) {
        Object acc = args.length == 0 ? 1 : args[0];
        for (int i = 1; i < args.length; i++) acc = _hyper("*", acc, args[i]);
        return acc;
    }
    Object quotient(Object a, Object b) { return _hyper("/", a, b); }
    Object mod(Object a, Object b) { return _hyper("mod", a, b); }
    Object power(Object a, Object b) { return _hyper("pow", a, b); }
    Object atan2(Object a, Object b) { return _hyper("atan2", a, b); }
    boolean equals(Object... args) {
        for (int i = 0; i < args.length - 1; i++)
            if (!asBool(_hyper("=", args[i], args[i + 1]))) return false;
        return true;
    }
    boolean not_equals(Object... args) { return !equals(args); }
    boolean less(Object... args) {
        for (int i = 0; i < args.length - 1; i++)
            if (!asBool(_hyper("<", args[i], args[i + 1]))) return false;
        return true;
    }
    boolean less_eq(Object... args) {
        for (int i = 0; i < args.length - 1; i++)
            if (!asBool(_hyper("<=", args[i], args[i + 1]))) return false;
        return true;
    }
    boolean greater(Object... args) {
        for (int i = 0; i < args.length - 1; i++)
            if (!asBool(_hyper(">", args[i], args[i + 1]))) return false;
        return true;
    }
    boolean greater_eq(Object... args) {
        for (int i = 0; i < args.length - 1; i++)
            if (!asBool(_hyper(">=", args[i], args[i + 1]))) return false;
        return true;
    }
    boolean both(Object... args) { for (Object a : args) if (!asBool(a)) return false; return true; }
    boolean either(Object... args) { for (Object a : args) if (asBool(a)) return true; return false; }
    boolean identical(Object... args) {
        for (int i = 0; i < args.length - 1; i++) if (args[i] != args[i + 1]) return false;
        return true;
    }
    Object monadic(Object name, Object n) {
        String key = name instanceof List ? String.valueOf(((List<?>) name).get(0)) : String.valueOf(name);
        Function<Double, Double> fn = switch (key) {
            case "abs" -> Math::abs;
            case "neg" -> x -> -x;
            case "ceiling" -> Math::ceil;
            case "floor" -> Math::floor;
            case "sqrt" -> Math::sqrt;
            case "sin" -> x -> Math.sin(Math.toRadians(x));
            case "cos" -> x -> Math.cos(Math.toRadians(x));
            case "tan" -> x -> Math.tan(Math.toRadians(x));
            case "asin" -> x -> Math.toDegrees(Math.asin(x));
            case "acos" -> x -> Math.toDegrees(Math.acos(x));
            case "atan" -> x -> Math.toDegrees(Math.atan(x));
            case "ln" -> Math::log;
            case "log" -> Math::log10;
            case "e^" -> Math::exp;
            case "10^" -> x -> Math.pow(10, x);
            case "2^" -> x -> Math.pow(2, x);
            case "round" -> x -> (double) Math.round(x);
            default -> x -> x;
        };
        if (n instanceof List && hyperops) {
            List<Object> out = new ArrayList<>();
            for (Object x : (List<?>) n) out.add(monadic(key, x));
            return out;
        }
        return fn.apply(n instanceof Number ? ((Number) n).doubleValue() : 0);
    }
    Object round(Object n) { return monadic("round", n); }
    int random(Object a, Object b) {
        int aa = ((Number) a).intValue(), bb = ((Number) b).intValue();
        return ThreadLocalRandom.current().nextInt(aa, bb + 1);
    }
    boolean not_(Object b) { return !asBool(b); }
    <T, R> List<R> map(Function<T, R> ring, List<T> xs) {
        List<R> out = new ArrayList<>(); for (T x : xs) out.add(ring.apply(x)); return out;
    }
    <T> List<T> keep(Predicate<T> pred, List<T> xs) {
        List<T> out = new ArrayList<>(); for (T x : xs) if (pred.test(x)) out.add(x); return out;
    }
    <T> T find_first(Predicate<T> pred, List<T> xs) {
        for (T x : xs) if (pred.test(x)) return x; return null;
    }
    <T> T combine(List<T> xs, BinaryOperator<T> ring) {
        return xs.stream().reduce(ring).orElse(null);
    }
    Object pipe(Object value, Function<Object, Object>... rings) {
        for (Function<Object, Object> r : rings) value = r.apply(value);
        return value;
    }
    Object call(Function<Object[], Object> ring, Object... args) { return ring.apply(args); }
    void run(Consumer<Object[]> ring, Object... args) { ring.accept(args); }
    void launch(Consumer<Object[]> ring, Object... args) { CompletableFuture.runAsync(() -> ring.accept(args)); }
    Object script(Supplier<Object> thunk) { return thunk.get(); }
    void move(double steps) {
        double r = Math.toRadians(90 - direction);
        x += steps * Math.cos(r); y += steps * Math.sin(r);
    }
    void turn_right(double d) { direction = (direction + d) % 360; }
    void turn_left(double d) { direction = (direction - d) % 360; }
    void point_in_direction(double d) { direction = d; }
    void point_towards(Object o) {}
    void go_to(Object a, Object b) {
        if (b != null) { x = ((Number) a).doubleValue(); y = ((Number) b).doubleValue(); }
    }
    void glide(Object... a) {}
    void change_x(double n) { x += n; } void set_x(double n) { x = n; }
    void change_y(double n) { y += n; } void set_y(double n) { y = n; }
    void if_on_edge_bounce() {}
    List<Double> position() { return List.of(x, y); }
    double x_position() { return x; } double y_position() { return y; }
    void say(Object... a) { System.out.println(Arrays.toString(a)); }
    void think(Object... a) { System.out.println(Arrays.toString(a)); }
    void switch_costume(Object... a) {} void next_costume() { costume_number++; }
    void change_effect(Object name, double n) { _effects.merge(String.valueOf(name), n, Double::sum); }
    void set_effect(Object name, double n) { _effects.put(String.valueOf(name), n); }
    double effect(Object name) { return _effects.getOrDefault(String.valueOf(name), 0.0); }
    void clear_graphic_effects() { _effects.clear(); }
    void change_size(double n) { size += n; } void set_size(double n) { size = n; }
    void show() { shown = true; } void hide() { shown = false; } boolean is_shown() { return shown; }
    void go_to_layer(Object... a) {} void go_back_layers(Object... a) {}
    void alert(Object... a) { System.out.println(Arrays.toString(a)); }
    void play_sound(Object... a) {} void play_sound_until_done(Object... a) {}
    void play_sound_at(Object... a) {} void stop_all_sounds() {}
    void rest(Object... a) {} void play_note(Object... a) {} void play_frequency(Object... a) {}
    void set_instrument(Object... a) {}
    void change_tempo(double n) { tempo += n; } void set_tempo(double n) { tempo = n; }
    void change_volume(double n) { volume += n; } void set_volume(double n) { volume = n; }
    void change_balance(Object... a) {} void set_balance(Object... a) {} double balance() { return 0; }
    void stop_frequency() {} void clear() {}
    void pen_down_fn() { pen_down = true; } void pen_up() { pen_down = false; }
    boolean is_pen_down() { return pen_down; } void set_pen_color(Object... a) {}
    void change_pen_size(double n) { pen_size += n; } void set_pen_size(double n) { pen_size = n; }
    void stamp() {} void fill() {} void write_pen(Object... a) {}
    void paste_on(Object... a) {} void cut_from(Object... a) {}
    void wait(Object secs) {
        try { Thread.sleep((long) ((((Number) secs).doubleValue()) * 1000)); }
        catch (Exception e) {}
    }
    void wait_until(Supplier<Boolean> pred) { while (!pred.get()) wait(0.01); }
    void broadcast(Object... a) {} void broadcast_and_wait(Object... a) {}
    void stop_all() { throw new RuntimeException("stop all"); }
    void create_clone(Object... a) {} void delete_this_clone() {} void pause_all() {}
    String ask(Object prompt) {
        System.out.print(prompt == null ? "" : prompt);
        try { _answer = new Scanner(System.in).nextLine(); } catch (Exception e) { _answer = ""; }
        return _answer;
    }
    String answer() { return _answer; }
    void reset_timer() { _timer0 = System.currentTimeMillis(); }
    double timer() { return (System.currentTimeMillis() - _timer0) / 1000.0; }
    boolean touching(Object... a) { return false; }
    boolean touching_color(Object... a) { return false; }
    boolean color_is_touching(Object... a) { return false; }
    double mouse_x() { return 0; } double mouse_y() { return 0; } boolean mouse_down() { return false; }
    List<Double> mouse_position() { return List.of(0.0, 0.0); }
    boolean key_pressed(Object... a) { return false; }
    Object attribute(Object... a) { return null; } Object object(Object... a) { return null; }
    String http_get(Object url) { return ""; }
    String current(Object... a) { return java.time.Instant.now().toString(); }
    Object my(Object... a) { return null; } Object aspect(Object... a) { return 0; }
    Object relation(Object... a) { return 0; } Object microphone(Object... a) { return 0; }
    Object video(Object... a) { return 0; }
    void show_variable(Object... a) {} void hide_variable(Object... a) {}
    void tell(Object... a) {}
    Object ask_for(Object t, Function<Object[], Object> ring, Object... args) { return ring.apply(args); }
    Object new_clone(Object... a) { return null; } void switch_scene(Object... a) {}
    int unicode_of(Object t) {
        String s = t == null ? "" : String.valueOf(t);
        return s.isEmpty() ? 0 : s.charAt(0);
    }
    String unicode_as_letter(Object n) { return String.valueOf((char) ((Number) n).intValue()); }
    boolean is_a(Object v, Object typ) {
        String key = String.valueOf(typ instanceof List ? ((List<?>) typ).get(0) : typ).toLowerCase();
        return switch (key) {
            case "number" -> v instanceof Number;
            case "text" -> v instanceof String;
            case "list" -> v instanceof List;
            case "boolean" -> v instanceof Boolean;
            default -> true;
        };
    }
    String type_of(Object v) {
        if (v instanceof Boolean) return "boolean";
        if (v instanceof Number) return "number";
        if (v instanceof String) return "text";
        if (v instanceof List) return "list";
        return v == null ? "nothing" : v.getClass().getSimpleName();
    }
    Object list_attribute(Object choice, List<?> xs) { return length(xs); }
    Object text_attribute(Object c, Object text) { return length(text); }
    double min(double... args) { return Arrays.stream(args).min().orElse(0); }
    double max(double... args) { return Arrays.stream(args).max().orElse(0); }
    Object hyper_zip(Object... args) { return Arrays.asList(args); }
}

Snap snap = new Snap();
`
};

SnapCodifier.buildMappings = function () {
    var p = this.profile(),
        lang = this.language,
        T = {},
        semi = (lang === 'javascript' || lang === 'java') ? ';' : '';

    T.string = lang === 'javascript' ? "'<#1>'" : '"<#1>"';
    T.number = '<#1>';
    T.boolTrue = p.boolTrue;
    T.boolFalse = p.boolFalse;
    T.reify = '<#1>';
    T.delim = ', ';
    T.item = '<#1>';
    T.list = lang === 'lua' ? '{<#1>}' :
        (lang === 'java' ? 'java.util.List.of(<#1>)' : '[<#1>]');
    T.parms_delim = ', ';
    T.parms_item = '<#1>';
    T.parms_list = '<#1>';
    T.tempvars_delim = ', ';
    T.tempvars_item = '<#1>';
    T.tempvars_list = '<#1>';

    // Fallback templates (special emitters override when active)
    if (lang === 'python') {
        T.doForever = 'while True:\n    <#1>';
        T.doRepeat = 'for _ in range(int(<#1>)):\n    <#2>';
        T.doUntil = 'while not (<#1>):\n    <#2>';
        T.doFor = 'for <#1> in range(int(<#2>), int(<#3>) + 1):\n    <#4>';
        T.doForEach = 'for <#1> in <#2>:\n    <#3>';
        T.doIf = 'if <#1>:\n    <#2>';
        T.doIfElse = 'if <#1>:\n    <#2>\nelse:\n    <#3>';
        T.reportIfElse = '(<#2> if <#1> else <#3>)';
        T.doReport = 'return <#1>';
        T.doStopThis = 'return';
        T.doDeclareVariables = '<#1> = None';
        T.doSetVar = '<#1> = <#2>';
        T.doChangeVar = '<#1> = (<#1>) + (<#2>)';
        T.doWait = 'snap.wait(<#1>)';
        T.doWaitUntil = 'snap.wait_until(lambda: <#1>)';
        T.doBroadcast = 'snap.broadcast(<#1>)';
        T.doBroadcastAndWait = 'snap.broadcast_and_wait(<#1>)';
        T.doRun = 'snap.run(<#1>, <#2>)';
        T.fork = 'snap.launch(<#1>, <#2>)';
        T.evaluate = 'snap.call(<#1>, <#2>)';
        T.doWarp = '<#1>';
        T.reifyScript = '(lambda <#2>: snap.script(lambda: None\n    or (\n    <#1>\n    )))';
        T.reifyReporter = '(lambda <#2>: (<#1>))';
        T.reifyPredicate = T.reifyReporter;
    } else if (lang === 'javascript') {
        T.doForever = 'while (true) {\n    <#1>\n}';
        T.doRepeat = 'for (let _i = 0; _i < <#1>; _i++) {\n    <#2>\n}';
        T.doUntil = 'while (!(<#1>)) {\n    <#2>\n}';
        T.doFor = 'for (let <#1> = <#2>; <#1> <= <#3>; <#1>++) {\n    <#4>\n}';
        T.doForEach = 'for (const <#1> of <#2>) {\n    <#3>\n}';
        T.doIf = 'if (<#1>) {\n    <#2>\n}';
        T.doIfElse = 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}';
        T.reportIfElse = '(<#1> ? <#2> : <#3>)';
        T.doReport = 'return <#1>;';
        T.doStopThis = 'return;';
        T.doDeclareVariables = 'let <#1>;';
        T.doSetVar = '<#1> = <#2>;';
        T.doChangeVar = '<#1> += <#2>;';
        T.doWait = 'await snap.wait(<#1>);';
        T.doWaitUntil = 'await snap.wait_until(() => <#1>);';
        T.doBroadcast = 'snap.broadcast(<#1>);';
        T.doBroadcastAndWait = 'await snap.broadcast_and_wait(<#1>);';
        T.doRun = 'snap.run(<#1>, <#2>);';
        T.fork = 'snap.launch(<#1>, <#2>);';
        T.evaluate = 'snap.call(<#1>, <#2>)';
        T.doWarp = '<#1>';
        T.reifyScript = '((<#2>) => {\n    <#1>\n})';
        T.reifyReporter = '((<#2>) => (<#1>))';
        T.reifyPredicate = T.reifyReporter;
    } else if (lang === 'java') {
        T.doForever = 'while (true) {\n    <#1>\n}';
        T.doRepeat = 'for (int _i = 0; _i < ((Number)(<#1>)).intValue(); _i++) {\n    <#2>\n}';
        T.doUntil = 'while (!(<#1>)) {\n    <#2>\n}';
        T.doFor = 'for (int <#1> = ((Number)(<#2>)).intValue(); <#1> <= ((Number)(<#3>)).intValue(); <#1>++) {\n    <#4>\n}';
        T.doForEach = 'for (Object <#1> : (Iterable<?>)(<#2>)) {\n    <#3>\n}';
        T.doIf = 'if (<#1>) {\n    <#2>\n}';
        T.doIfElse = 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}';
        T.reportIfElse = '((<#1>) ? (<#2>) : (<#3>))';
        T.doReport = 'return <#1>;';
        T.doStopThis = 'return;';
        T.doDeclareVariables = 'Object <#1> = null;';
        T.doSetVar = '<#1> = <#2>;';
        T.doChangeVar = '<#1> = ((Number)<#1>).doubleValue() + ((Number)(<#2>)).doubleValue();';
        T.doWait = 'snap.wait(<#1>);';
        T.doWaitUntil = 'snap.wait_until(() -> <#1>);';
        T.doBroadcast = 'snap.broadcast(<#1>);';
        T.doBroadcastAndWait = 'snap.broadcast_and_wait(<#1>);';
        T.doRun = 'snap.run(<#1>, <#2>);';
        T.fork = 'snap.launch(<#1>, <#2>);';
        T.evaluate = 'snap.call(<#1>, <#2>)';
        T.doWarp = '<#1>';
        T.reifyScript = '((<#2>) -> {\n    <#1>\n})';
        T.reifyReporter = '((<#2>) -> (<#1>))';
        T.reifyPredicate = T.reifyReporter;
    } else { // lua
        T.doForever = 'while true do\n    <#1>\nend';
        T.doRepeat = 'for _ = 1, <#1> do\n    <#2>\nend';
        T.doUntil = 'while not (<#1>) do\n    <#2>\nend';
        T.doFor = 'for <#1> = <#2>, <#3> do\n    <#4>\nend';
        T.doForEach = 'for _, <#1> in ipairs(<#2>) do\n    <#3>\nend';
        T.doIf = 'if <#1> then\n    <#2>\nend';
        T.doIfElse = 'if <#1> then\n    <#2>\nelse\n    <#3>\nend';
        T.reportIfElse = '((<#1>) and (<#2>) or (<#3>))';
        T.doReport = 'return <#1>';
        T.doStopThis = 'return';
        T.doDeclareVariables = 'local <#1>';
        T.doSetVar = '<#1> = <#2>';
        T.doChangeVar = '<#1> = <#1> + <#2>';
        T.doWait = 'snap.wait(<#1>)';
        T.doWaitUntil = 'snap.wait_until(function() return <#1> end)';
        T.doBroadcast = 'snap.broadcast(<#1>)';
        T.doBroadcastAndWait = 'snap.broadcast_and_wait(<#1>)';
        T.doRun = 'snap.run(<#1>, <#2>)';
        T.fork = 'snap.launch(<#1>, <#2>)';
        T.evaluate = 'snap.call(<#1>, <#2>)';
        T.doWarp = '<#1>';
        T.reifyScript = '(function(<#2>)\n    <#1>\nend)';
        T.reifyReporter = '(function(<#2>) return <#1> end)';
        T.reifyPredicate = T.reifyReporter;
    }

    // Prefer idiomatic language forms (like Snap's "map to Python" codification).
    // Special emitters refine these further; snap.* remains for stage-only primitives.
    if (lang === 'python') {
        T.reportListItem = '(<#2>)[(<#1>) - 1]';
        T.reportLetter = 'str(<#2>)[(<#1>) - 1]';
        T.doDeleteFromList = 'del (<#2>)[(<#1>) - 1]';
        T.doInsertInList = '(<#3>).insert((<#2>) - 1, <#1>)';
        T.doReplaceInList = '(<#3>)[(<#2>) - 1] = <#1>';
        T.reportListIndex = '((<#2>).index(<#1>) + 1 if (<#1>) in (<#2>) else 0)';
        T.reportNumbers = 'list(range(int(<#1>), int(<#2>) + 1))';
        T.reportNewList = T.list;
        T.reportCONS = '[<#1>] + list(<#2>)';
        T.reportCDR = 'list(<#1>)[1:]';
        T.reportListLength = 'len(<#1>)';
        T.reportListAttribute = 'len(<#2>)';
        T.reportListContainsItem = '((<#2>) in (<#1>))';
        T.reportListIsEmpty = '(len(<#1>) == 0)';
        T.doAddToList = '(<#2>).append(<#1>)';
        T.reportConcatenatedLists = '(<#1>)';
        T.reportMap = '[<#1>(x) for x in <#2>]';
        T.reportKeep = '[x for x in <#2> if <#1>(x)]';
        T.reportFindFirst = 'next((x for x in <#2> if <#1>(x)), None)';
        T.reportCombine = 'reduce(<#2>, <#1>)';
        T.reportJoinWords = '"".join([str(x) for x in [<#1>]])';
        T.reportStringSize = 'len(str(<#1>))';
        T.reportTextAttribute = 'len(str(<#2>))';
        T.reportTextSplit = 'str(<#1>).split(<#2>)';
        T.reportMonadic = 'snap.monadic(<#1>, <#2>)';
        T.reportUnicode = 'ord(str(<#1>)[0])';
        T.reportUnicodeAsLetter = 'chr(int(<#1>))';
        T.reportIsA = 'isinstance(<#1>, <#2>)';
        T.reportTypeOf = 'type(<#1>).__name__';
        T.reportNot = '(not <#1>)';
        T.reportVariadicSum = '(<#1>)';
        T.reportVariadicProduct = '(<#1>)';
        T.reportVariadicMin = 'min(<#1>)';
        T.reportVariadicMax = 'max(<#1>)';
        T.reportVariadicEquals = '(<#1>)';
        T.reportVariadicNotEquals = '(<#1>)';
        T.reportVariadicLessThan = '(<#1>)';
        T.reportVariadicLessThanOrEquals = '(<#1>)';
        T.reportVariadicGreaterThan = '(<#1>)';
        T.reportVariadicGreaterThanOrEquals = '(<#1>)';
        T.reportVariadicAnd = '(<#1>)';
        T.reportVariadicOr = '(<#1>)';
        T.reportVariadicIsIdentical = '(<#1>)';
        T.reportDifference = '(<#1> - <#2>)';
        T.reportQuotient = '(<#1> / <#2>)';
        T.reportPower = '(<#1> ** <#2>)';
        T.reportModulus = '(<#1> % <#2>)';
        T.reportAtan2 = 'math.atan2(<#1>, <#2>)';
        T.reportRound = 'round(<#1>)';
        T.reportRandom = 'random.randint(int(<#1>), int(<#2>))';
        T.doSayFor = 'print(<#1>)';
        T.bubble = 'print(<#1>)';
        T.doThinkFor = 'print(<#1>)';
        T.doThink = 'print(<#1>)';
        T.log = 'print(<#1>)';
        T.alert = 'print(<#1>)';
        T.doShowVar = 'print(<#1>)';
        T.doHideVar = '';
        T.doChangeVar = '<#1> += <#2>';
        T.evaluate = '<#1>(<#2>)';
        T.doRun = '<#1>(<#2>)';
    } else if (lang === 'javascript') {
        T.reportListItem = '(<#2>)[(<#1>) - 1]';
        T.reportLetter = 'String(<#2>)[(<#1>) - 1]';
        T.doDeleteFromList = '(<#2>).splice((<#1>) - 1, 1);';
        T.doInsertInList = '(<#3>).splice((<#2>) - 1, 0, <#1>);';
        T.doReplaceInList = '(<#3>)[(<#2>) - 1] = <#1>;';
        T.reportListIndex = '((<#2>).indexOf(<#1>) + 1)';
        T.reportNumbers = 'Array.from({length: (<#2>)-(<#1>)+1}, (_,i)=>(<#1>)+i)';
        T.reportNewList = T.list;
        T.reportCONS = '[<#1>, ...<#2>]';
        T.reportCDR = '(<#1>).slice(1)';
        T.reportListLength = '(<#1>).length';
        T.reportListAttribute = '(<#2>).length';
        T.reportListContainsItem = '(<#1>).includes(<#2>)';
        T.reportListIsEmpty = '((<#1>).length === 0)';
        T.doAddToList = '(<#2>).push(<#1>);';
        T.reportConcatenatedLists = '[].concat(<#1>)';
        T.reportMap = '(<#2>).map(<#1>)';
        T.reportKeep = '(<#2>).filter(<#1>)';
        T.reportFindFirst = '(<#2>).find(<#1>)';
        T.reportCombine = '(<#1>).reduce(<#2>)';
        T.reportJoinWords = '[<#1>].join("")';
        T.reportStringSize = 'String(<#1>).length';
        T.reportTextAttribute = 'String(<#2>).length';
        T.reportTextSplit = 'String(<#1>).split(<#2>)';
        T.reportMonadic = 'snap.monadic(<#1>, <#2>)';
        T.reportUnicode = 'String(<#1>).charCodeAt(0)';
        T.reportUnicodeAsLetter = 'String.fromCharCode(<#1>)';
        T.reportIsA = 'snap.is_a(<#1>, <#2>)';
        T.reportTypeOf = 'typeof <#1>';
        T.reportNot = '!(<#1>)';
        T.reportVariadicSum = '(<#1>)';
        T.reportVariadicProduct = '(<#1>)';
        T.reportVariadicMin = 'Math.min(<#1>)';
        T.reportVariadicMax = 'Math.max(<#1>)';
        T.reportVariadicEquals = '(<#1>)';
        T.reportVariadicNotEquals = '(<#1>)';
        T.reportVariadicLessThan = '(<#1>)';
        T.reportVariadicLessThanOrEquals = '(<#1>)';
        T.reportVariadicGreaterThan = '(<#1>)';
        T.reportVariadicGreaterThanOrEquals = '(<#1>)';
        T.reportVariadicAnd = '(<#1>)';
        T.reportVariadicOr = '(<#1>)';
        T.reportVariadicIsIdentical = '(<#1>)';
        T.reportDifference = '(<#1> - <#2>)';
        T.reportQuotient = '(<#1> / <#2>)';
        T.reportPower = '(<#1> ** <#2>)';
        T.reportModulus = '(<#1> % <#2>)';
        T.reportAtan2 = 'Math.atan2(<#1>, <#2>)';
        T.reportRound = 'Math.round(<#1>)';
        T.reportRandom = '(<#1> + Math.floor(Math.random() * ((<#2>) - (<#1>) + 1)))';
        T.doSayFor = 'console.log(<#1>);';
        T.bubble = 'console.log(<#1>);';
        T.doThinkFor = 'console.log(<#1>);';
        T.doThink = 'console.log(<#1>);';
        T.log = 'console.log(<#1>);';
        T.alert = 'console.log(<#1>);';
        T.doShowVar = 'console.log(<#1>);';
        T.doHideVar = '';
        T.evaluate = '<#1>(<#2>)';
        T.doRun = '<#1>(<#2>);';
    } else {
        // Java / Lua: keep snap helpers for list/index oddities
        T.reportListItem = 'snap.item(<#1>, <#2>)';
        T.reportLetter = 'snap.letter(<#1>, <#2>)';
        T.doDeleteFromList = 'snap.delete(<#1>, <#2>)' + semi;
        T.doInsertInList = 'snap.insert(<#1>, <#2>, <#3>)' + semi;
        T.doReplaceInList = 'snap.replace(<#2>, <#3>, <#1>)' + semi;
        T.reportListIndex = 'snap.index_of(<#1>, <#2>)';
        T.reportNumbers = 'snap.numbers(<#1>, <#2>)';
        T.reportNewList = T.list;
        T.reportCONS = 'snap.cons(<#1>, <#2>)';
        T.reportCDR = 'snap.cdr(<#1>)';
        T.reportListLength = 'snap.length(<#1>)';
        T.reportListAttribute = 'snap.list_attribute(<#1>, <#2>)';
        T.reportListContainsItem = 'snap.contains(<#1>, <#2>)';
        T.reportListIsEmpty = 'snap.is_empty(<#1>)';
        T.doAddToList = 'snap.add(<#1>, <#2>)' + semi;
        T.reportConcatenatedLists = 'snap.append_lists(<#1>)';
        T.reportMap = 'snap.map(<#1>, <#2>)';
        T.reportKeep = 'snap.keep(<#1>, <#2>)';
        T.reportFindFirst = 'snap.find_first(<#1>, <#2>)';
        T.reportCombine = 'snap.combine(<#1>, <#2>)';
        T.reportJoinWords = 'snap.join(<#1>)';
        T.reportStringSize = 'snap.length(<#1>)';
        T.reportTextAttribute = 'snap.text_attribute(<#1>, <#2>)';
        T.reportTextSplit = 'snap.split(<#1>, <#2>)';
        T.reportMonadic = 'snap.monadic(<#1>, <#2>)';
        T.reportUnicode = 'snap.unicode_of(<#1>)';
        T.reportUnicodeAsLetter = 'snap.unicode_as_letter(<#1>)';
        T.reportIsA = 'snap.is_a(<#1>, <#2>)';
        T.reportTypeOf = 'snap.type_of(<#1>)';
        T.reportNot = 'snap.not_(<#1>)';
        T.reportVariadicSum = 'snap.sum(<#1>)';
        T.reportVariadicProduct = 'snap.product(<#1>)';
        T.reportVariadicMin = 'snap.min(<#1>)';
        T.reportVariadicMax = 'snap.max(<#1>)';
        T.reportVariadicEquals = 'snap.equals(<#1>)';
        T.reportVariadicNotEquals = 'snap.not_equals(<#1>)';
        T.reportVariadicLessThan = 'snap.less(<#1>)';
        T.reportVariadicLessThanOrEquals = 'snap.less_eq(<#1>)';
        T.reportVariadicGreaterThan = 'snap.greater(<#1>)';
        T.reportVariadicGreaterThanOrEquals = 'snap.greater_eq(<#1>)';
        T.reportVariadicAnd = 'snap.both(<#1>)';
        T.reportVariadicOr = 'snap.either(<#1>)';
        T.reportVariadicIsIdentical = 'snap.identical(<#1>)';
        T.reportDifference = 'snap.difference(<#1>, <#2>)';
        T.reportQuotient = 'snap.quotient(<#1>, <#2>)';
        T.reportPower = 'snap.power(<#1>, <#2>)';
        T.reportModulus = 'snap.mod(<#1>, <#2>)';
        T.reportAtan2 = 'snap.atan2(<#1>, <#2>)';
        T.reportRound = 'snap.round(<#1>)';
        T.reportRandom = 'snap.random(<#1>, <#2>)';
    }
    T.reportAtomicMap = T.reportMap;
    T.reportAtomicKeep = T.reportKeep;
    T.reportAtomicFindFirst = T.reportFindFirst;
    T.reportAtomicCombine = T.reportCombine;
    T.reportBoolean = '<#1>';
    T.reportTrue = p.boolTrue;
    T.reportFalse = p.boolFalse;
    T.reportPipe = 'snap.pipe(<#1>, <#2>)';

    T.forward = 'snap.move(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.turn = 'snap.turn_right(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.turnLeft = 'snap.turn_left(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setHeading = 'snap.point_in_direction(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doFaceTowards = 'snap.point_towards(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.gotoXY = 'snap.go_to(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doGotoObject = 'snap.go_to(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doGlide = 'snap.glide(<#1>, <#2>, <#3>)' + (('cmd' === 'cmd') ? semi : '');
    T.changeXPosition = 'snap.change_x(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setXPosition = 'snap.set_x(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.changeYPosition = 'snap.change_y(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setYPosition = 'snap.set_y(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.bounceOffEdge = 'snap.if_on_edge_bounce()' + (('cmd' === 'cmd') ? semi : '');
    T.getPosition = 'snap.position()' + (('rep' === 'cmd') ? semi : '');
    T.xPosition = 'snap.x_position()' + (('rep' === 'cmd') ? semi : '');
    T.yPosition = 'snap.y_position()' + (('rep' === 'cmd') ? semi : '');
    T.direction = 'snap.direction';
    if (lang !== 'python' && lang !== 'javascript') {
        T.doSayFor = 'snap.say(<#1>, <#2>)' + semi;
        T.bubble = 'snap.say(<#1>)' + semi;
        T.doThinkFor = 'snap.think(<#1>, <#2>)' + semi;
        T.doThink = 'snap.think(<#1>)' + semi;
    }
    T.doSwitchToCostume = 'snap.switch_costume(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doWearNextCostume = 'snap.next_costume()' + (('cmd' === 'cmd') ? semi : '');
    T.getCostumeIdx = 'snap.costume_number';
    T.changeEffect = 'snap.change_effect(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.setEffect = 'snap.set_effect(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.getEffect = 'snap.effect(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.clearEffects = 'snap.clear_graphic_effects()' + (('cmd' === 'cmd') ? semi : '');
    T.changeScale = 'snap.change_size(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setScale = 'snap.set_size(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.getScale = 'snap.size';
    T.show = 'snap.show()' + (('cmd' === 'cmd') ? semi : '');
    T.hide = 'snap.hide()' + (('cmd' === 'cmd') ? semi : '');
    T.reportShown = 'snap.is_shown()' + (('rep' === 'cmd') ? semi : '');
    T.goToLayer = 'snap.go_to_layer(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.goBack = 'snap.go_back_layers(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    if (lang !== 'python' && lang !== 'javascript') {
        T.alert = 'snap.alert(<#1>)' + semi;
        T.log = 'snap.say(<#1>)' + semi;
    }
    T.playSound = 'snap.play_sound(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPlaySoundUntilDone = 'snap.play_sound_until_done(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPlaySoundAtRate = 'snap.play_sound_at(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doStopAllSounds = 'snap.stop_all_sounds()' + (('cmd' === 'cmd') ? semi : '');
    T.doRest = 'snap.rest(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPlayNote = 'snap.play_note(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPlayFrequency = 'snap.play_frequency(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doSetInstrument = 'snap.set_instrument(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doChangeTempo = 'snap.change_tempo(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doSetTempo = 'snap.set_tempo(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.getTempo = 'snap.tempo';
    T.changeVolume = 'snap.change_volume(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setVolume = 'snap.set_volume(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.getVolume = 'snap.volume';
    T.changePan = 'snap.change_balance(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setPan = 'snap.set_balance(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.getPan = 'snap.balance()' + (('rep' === 'cmd') ? semi : '');
    T.playFreq = 'snap.play_frequency(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.stopFreq = 'snap.stop_frequency()' + (('cmd' === 'cmd') ? semi : '');
    T.clear = 'snap.clear()' + (('cmd' === 'cmd') ? semi : '');
    T.down = 'snap.pen_down_fn()' + (('cmd' === 'cmd') ? semi : '');
    T.up = 'snap.pen_up()' + (('cmd' === 'cmd') ? semi : '');
    T.getPenDown = 'snap.is_pen_down()' + (('rep' === 'cmd') ? semi : '');
    T.setColor = 'snap.set_pen_color(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setPenColorDimension = 'snap.set_pen_color(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.changePenColorDimension = 'snap.set_pen_color(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.getPenAttribute = 'snap.effect(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.changeSize = 'snap.change_pen_size(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setSize = 'snap.set_pen_size(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doStamp = 'snap.stamp()' + (('cmd' === 'cmd') ? semi : '');
    T.floodFill = 'snap.fill()' + (('cmd' === 'cmd') ? semi : '');
    T.write = 'snap.write_pen(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPasteOn = 'snap.paste_on(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doCutFrom = 'snap.cut_from(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doWait = 'snap.wait(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doWaitUntil = 'snap.wait_until(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doReport = (lang === 'javascript' || lang === 'java') ? 'return <#1>;' : 'return <#1>';
    T.doStopAll = 'snap.stop_all()' + (('cmd' === 'cmd') ? semi : '');
    T.createClone = 'snap.create_clone(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.newClone = 'snap.new_clone(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.removeClone = 'snap.delete_this_clone()' + (('cmd' === 'cmd') ? semi : '');
    T.doPauseAll = 'snap.pause_all()' + (('cmd' === 'cmd') ? semi : '');
    T.doAsk = 'snap.ask(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportLastAnswer = 'snap.answer()' + (('rep' === 'cmd') ? semi : '');
    T.getLastAnswer = 'snap.answer()' + (('rep' === 'cmd') ? semi : '');
    T.doResetTimer = 'snap.reset_timer()' + (('cmd' === 'cmd') ? semi : '');
    T.reportTimer = 'snap.timer()' + (('rep' === 'cmd') ? semi : '');
    T.getTimer = 'snap.timer()' + (('rep' === 'cmd') ? semi : '');
    T.reportTouchingObject = 'snap.touching(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportTouchingColor = 'snap.touching_color(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportColorIsTouchingColor = 'snap.color_is_touching(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportMousePosition = 'snap.mouse_position()' + (('rep' === 'cmd') ? semi : '');
    T.reportMouseX = 'snap.mouse_x()' + (('rep' === 'cmd') ? semi : '');
    T.reportMouseY = 'snap.mouse_y()' + (('rep' === 'cmd') ? semi : '');
    T.reportMouseDown = 'snap.mouse_down()' + (('rep' === 'cmd') ? semi : '');
    T.reportKeyPressed = 'snap.key_pressed(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportAttributeOf = 'snap.attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportObject = 'snap.object(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportURL = 'snap.http_get(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportDate = 'snap.current(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportGet = 'snap.my(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportAspect = 'snap.aspect(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportRelationTo = 'snap.relation(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportAudio = 'snap.microphone(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportVideo = 'snap.video(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    if (lang !== 'python' && lang !== 'javascript') {
        T.doShowVar = 'snap.show_variable(<#1>)' + semi;
        T.doHideVar = 'snap.hide_variable(<#1>)' + semi;
    }
    T.doTellTo = 'snap.tell(<#1>, <#2>)' + semi;
    T.reportAskFor = 'snap.ask_for(<#1>, <#2>, <#3>)';
    T.doSwitchToScene = 'snap.switch_scene(<#1>, <#2>)' + semi;
    T.reportHyperZip = 'snap.hyper_zip(<#1>, <#2>, <#3>, <#4>, <#5>, <#6>, <#7>)';
    T.doSetVar = '<#1> = <#2>' + semi;
    if (lang === 'java') {
        T.doChangeVar = '<#1> = ((Number)<#1>).doubleValue() + ((Number)(<#2>)).doubleValue();';
    } else if (lang === 'javascript') {
        T.doChangeVar = '<#1> += <#2>;';
    } else if (lang === 'python') {
        T.doChangeVar = '<#1> += <#2>';
    } else {
        T.doChangeVar = '<#1> = (<#1>) + (<#2>)';
    }
    if (lang !== 'python' && lang !== 'javascript') {
        T.evaluate = 'snap.call(<#1>, <#2>)';
        T.doRun = 'snap.run(<#1>, <#2>)' + semi;
    }
    T.reportGetImageAttribute = 'snap.get_image_attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportNewCostume = 'snap.new_costume(<#1>, <#2>, <#3>)' + (('rep' === 'cmd') ? semi : '');
    T.reportNewCostumeStretched = 'snap.new_costume_stretched(<#1>, <#2>, <#3>)' + (('rep' === 'cmd') ? semi : '');
    T.reportNewCostumeSkewed = 'snap.new_costume_skewed(<#1>, <#2>, <#3>)' + (('rep' === 'cmd') ? semi : '');
    T.doScreenshot = 'snap.screenshot(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportCostumes = 'snap.costumes()' + (('rep' === 'cmd') ? semi : '');
    T.reportGetSoundAttribute = 'snap.get_sound_attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportNewSoundFromSamples = 'snap.new_sound_from_samples(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportSounds = 'snap.sounds()' + (('rep' === 'cmd') ? semi : '');
    T.setBackgroundColor = 'snap.set_background_color(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.setBackgroundColorDimension = 'snap.set_background_color_dimension(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.changeBackgroundColorDimension = 'snap.change_background_color_dimension(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportPenTrailsAsCostume = 'snap.pen_trails_as_costume()' + (('rep' === 'cmd') ? semi : '');
    T.reportPentrailsAsSVG = 'snap.pentrails_as_svg()' + (('rep' === 'cmd') ? semi : '');
    T.doDrawOn = 'snap.draw_on(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportColor = 'snap.color(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportColorAttribute = 'snap.color_attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportNewColor = 'snap.new_color(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.getLastMessage = 'snap.get_last_message()' + (('rep' === 'cmd') ? semi : '');
    T.reportPoll = 'snap.poll(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.doCallCC = 'snap.run_with_continuation(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportCallCC = 'snap.call_with_continuation(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.doDefineBlock = 'snap.define_block(<#1>, <#2>, <#3>)' + (('cmd' === 'cmd') ? semi : '');
    T.doSetBlockAttribute = 'snap.set_block_attribute(<#1>, <#2>, <#3>)' + (('cmd' === 'cmd') ? semi : '');
    T.doDeleteBlock = 'snap.delete_block(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportBlockAttribute = 'snap.block_attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportEnvironment = 'snap.environment(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.doSetSlot = 'snap.set_slot(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportNewProcess = 'snap.new_process(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportProcessAttribute = 'snap.process_attribute(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportProcessState = 'snap.process_state(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.doChangeProcess = 'snap.change_process(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportStackSize = 'snap.stack_size()' + (('rep' === 'cmd') ? semi : '');
    T.reportFrameCount = 'snap.frame_count()' + (('rep' === 'cmd') ? semi : '');
    T.reportYieldCount = 'snap.yield_count()' + (('rep' === 'cmd') ? semi : '');
    T.reportThreadCount = 'snap.thread_count()' + (('rep' === 'cmd') ? semi : '');
    T.doSetGlobalFlag = 'snap.set_global_flag(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportGlobalFlag = 'snap.global_flag(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportTextFunction = 'snap.text_function(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.reportCompiled = 'snap.compiled(<#1>, <#2>)' + (('rep' === 'cmd') ? semi : '');
    T.doDeleteAttr = 'snap.delete_attr(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doShowTable = 'snap.show_table(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.doPrimitive = 'snap.primitive(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.doApplyExtension = 'snap.apply_extension(<#1>, <#2>, <#3>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportApplyExtension = 'snap.apply_extension(<#1>, <#2>, <#3>)' + (('rep' === 'cmd') ? semi : '');
    T.doSetVideoTransparency = 'snap.set_video_transparency(<#1>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportConnected = 'snap.connected()' + (('rep' === 'cmd') ? semi : '');
    T.digitalWrite = 'snap.digital_write(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.pwmWrite = 'snap.pwm_write(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.servoWrite = 'snap.servo_write(<#1>, <#2>)' + (('cmd' === 'cmd') ? semi : '');
    T.reportDigitalReading = 'snap.digital_reading(<#1>)' + (('rep' === 'cmd') ? semi : '');
    T.reportJSFunction = 'snap.j_s_function(<#1>, <#2>, <#3>)';
    T.reportListCombination = 'snap.list_combination(<#1>, <#2>)';
    T.reportCrossproduct = 'snap.crossproduct(<#1>)';
    T.reportTranspose = 'snap.transpose(<#1>)';
    T.reportReshape = 'snap.reshape(<#1>, <#2>)';
    T.reportSlice = 'snap.slice(<#1>, <#2>)';
    T.doMapCodeOrHeader = 'snap.map_code_or_header(<#1>, <#2>, <#3>)' + semi;
    T.doMapValueCode = 'snap.map_value_code(<#1>, <#2>)' + semi;
    T.doMapListCode = 'snap.map_list_code(<#1>, <#2>, <#3>)' + semi;
    T.reportMappedCode = 'snap.mapped_code(<#1>)';
    T.receiveGo = p.comment + ' receiveGo';
    T.receiveKey = p.comment + ' receiveKey';
    T.receiveInteraction = p.comment + ' receiveInteraction';
    T.receiveMessage = p.comment + ' receiveMessage';
    T.receiveCondition = p.comment + ' receiveCondition';
    T.receiveConditionEvent = p.comment + ' receiveConditionEvent';
    T.receiveOnClone = p.comment + ' receiveOnClone';
    T.receiveUserEdit = p.comment + ' receiveUserEdit';
    T.receiveSlotEvent = p.comment + ' receiveSlotEvent';

    return T;
};

SnapCodifier.applyLanguage = function (langId) {
    var template, target, key;
    if (langId) { this.language = langId; }
    template = this.buildMappings();
    target = StageMorph.prototype.codeMappings;
    for (key in target) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
            delete target[key];
        }
    }
    for (key in template) {
        if (Object.prototype.hasOwnProperty.call(template, key)) {
            target[key] = template[key];
        }
    }
};

// ---- helpers for special structural emitters ------------------------

SnapCodifier.mapInput = function (input, defs) {
    if (isNil(input)) { return ''; }
    if (typeof input.mappedCode === 'function') {
        var mapped = input.mappedCode(defs);
        return isNil(mapped) ? '' : String(mapped);
    }
    return String(input);
};

SnapCodifier.withMultiArgMode = function (mode, fn) {
    var prev = this._multiArgMode;
    this._multiArgMode = mode;
    try {
        return fn();
    } finally {
        this._multiArgMode = prev;
    }
};

// Snap ring empty-hole semantics (see Process.prototype.bindInputs):
//   • no explicit formals → empty slots are implicit parameters
//   • one call-arg (map/keep) → every hole gets that same arg
//   • several call-args (combine) → holes bind left-to-right
SnapCodifier.emptySlotsOfRing = function (ring) {
    var expr, slot;
    if (!ring) { return []; }
    if (typeof ring.contents === 'function') {
        expr = ring.contents();
    }
    if (!expr && typeof ring.inputs === 'function') {
        slot = ring.inputs()[0];
        if (slot && typeof slot.nestedBlock === 'function') {
            expr = slot.nestedBlock();
        } else if (slot && typeof slot.allEmptySlots === 'function') {
            return slot.allEmptySlots();
        }
    }
    if (!expr || typeof expr.allEmptySlots !== 'function') {
        return [];
    }
    return expr.allEmptySlots();
};

SnapCodifier.implicitParamNames = function (count, mode) {
    var letters = 'abcdefghijklmnopqrstuvwxyz',
        names = [],
        i;
    if (mode === 'same' || count < 1) {
        return [this.ident('x')];
    }
    for (i = 0; i < count; i += 1) {
        if (i < letters.length) {
            names.push(this.ident(letters.charAt(i)));
        } else {
            names.push(this.ident('p' + (i + 1)));
        }
    }
    return names;
};

SnapCodifier.withHoleBindings = function (bindings, fn) {
    var prev = this._holeBindings;
    this._holeBindings = bindings;
    try {
        return fn.call(this);
    } finally {
        this._holeBindings = prev;
    }
};

SnapCodifier.resolveRingFormals = function (ring, explicitParms, mode) {
    // Returns {parms, slots, bindings}. Explicit ring inputs win; otherwise
    // invent formals from empty holes (Snap's implicit-parameter rule).
    var slots = this.emptySlotsOfRing(ring),
        parms = (explicitParms || []).slice(),
        bindings = null,
        names,
        i;

    if (parms.length > 0 || !slots.length) {
        return {parms: parms, slots: slots, bindings: null};
    }

    if (mode === 'same') {
        names = this.implicitParamNames(1, 'same');
        parms = names.slice();
        bindings = new Map();
        for (i = 0; i < slots.length; i += 1) {
            bindings.set(slots[i], names[0]);
        }
    } else {
        names = this.implicitParamNames(slots.length, 'sequential');
        parms = names.slice();
        bindings = new Map();
        for (i = 0; i < slots.length; i += 1) {
            bindings.set(slots[i], names[i]);
        }
    }
    return {parms: parms, slots: slots, bindings: bindings};
};

SnapCodifier.joinMapped = function (inputs, defs, delim) {
    var myself = this;
    return inputs.map(inp => myself.mapInput(inp, defs)).join(delim);
};

SnapCodifier.appendNext = function (block, defs, code) {
    if (block.nextBlock && block.nextBlock()) {
        code += '\n' + block.nextBlock().mappedCode(defs);
    }
    return code;
};

SnapCodifier.indentBlock = function (body, spaces) {
    var pad = new Array((spaces || 4) + 1).join(' '),
        text = String(body || '').replace(/^\n+|\n+$/g, '');
    if (!text.trim()) {
        return pad + this.profile().emptyBody;
    }
    return text.split('\n').map(line => pad + line).join('\n');
};

SnapCodifier.emptyOr = function (body) {
    var text = String(body || '').trim();
    return text ? body : this.profile().emptyBody;
};

// Special emitters: full control over Snap structural oddities
SnapCodifier.specialEmitters = {

    receiveGo: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when green flag clicked'
        );
    },
    receiveKey: function (block, defs) {
        var a = block.inputs().map(inp => this.mapInput(inp, defs));
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when ' + (a[0] || '') + ' key pressed'
        );
    },
    receiveInteraction: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when I am ' +
                this.mapInput(block.inputs()[0], defs)
        );
    },
    receiveMessage: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when I receive ' +
                this.mapInput(block.inputs()[0], defs)
        );
    },
    receiveCondition: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when ' +
                this.mapInput(block.inputs()[0], defs)
        );
    },
    receiveConditionEvent: function (block, defs) {
        return this.specialEmitters.receiveCondition.call(this, block, defs);
    },
    receiveOnClone: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when I start as a clone'
        );
    },
    receiveUserEdit: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when edited'
        );
    },
    receiveSlotEvent: function (block, defs) {
        return this.appendNext(
            block,
            defs,
            this.profile().comment + ' when slot signals'
        );
    },

    doIf: function (block, defs) {
        // if %b %c %elseif   — elseif MultiArg is flat [cond, body, cond, body, ...]
        var lang = this.language,
            inputs = block.inputs(),
            cond = this.mapInput(inputs[0], defs),
            body = this.emptyOr(this.mapInput(inputs[1], defs)),
            elseIf = inputs[2],
            pairs = (elseIf && elseIf.inputs) ? elseIf.inputs() : [],
            i,
            c2,
            b2,
            code;

        if (lang === 'python') {
            code = 'if ' + cond + ':\n' + this.indentBlock(body, 4);
            for (i = 0; i + 1 < pairs.length; i += 2) {
                c2 = this.mapInput(pairs[i], defs);
                b2 = this.emptyOr(this.mapInput(pairs[i + 1], defs));
                code += '\nelif ' + c2 + ':\n' + this.indentBlock(b2, 4);
            }
        } else if (lang === 'lua') {
            code = 'if ' + cond + ' then\n' + this.indentBlock(body, 4);
            for (i = 0; i + 1 < pairs.length; i += 2) {
                c2 = this.mapInput(pairs[i], defs);
                b2 = this.emptyOr(this.mapInput(pairs[i + 1], defs));
                code += '\nelseif ' + c2 + ' then\n' + this.indentBlock(b2, 4);
            }
            code += '\nend';
        } else {
            code = 'if (' + cond + ') {\n' + this.indentBlock(body, 4) + '\n}';
            for (i = 0; i + 1 < pairs.length; i += 2) {
                c2 = this.mapInput(pairs[i], defs);
                b2 = this.emptyOr(this.mapInput(pairs[i + 1], defs));
                code += ' else if (' + c2 + ') {\n' +
                    this.indentBlock(b2, 4) + '\n}';
            }
        }
        return this.appendNext(block, defs, code);
    },

    doIfElse: function (block, defs) {
        var lang = this.language,
            inputs = block.inputs(),
            cond = this.mapInput(inputs[0], defs),
            a = this.emptyOr(this.mapInput(inputs[1], defs)),
            b = this.emptyOr(this.mapInput(inputs[2], defs)),
            code;
        if (lang === 'python') {
            code = 'if ' + cond + ':\n' + this.indentBlock(a, 4) +
                '\nelse:\n' + this.indentBlock(b, 4);
        } else if (lang === 'lua') {
            code = 'if ' + cond + ' then\n' + this.indentBlock(a, 4) +
                '\nelse\n' + this.indentBlock(b, 4) + '\nend';
        } else {
            code = 'if (' + cond + ') {\n' + this.indentBlock(a, 4) +
                '\n} else {\n' + this.indentBlock(b, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    reportIfElse: function (block, defs) {
        var lang = this.language,
            inputs = block.inputs(),
            c = this.mapInput(inputs[0], defs),
            a = this.mapInput(inputs[1], defs),
            b = this.mapInput(inputs[2], defs);
        if (lang === 'python') {
            return '((' + a + ') if (' + c + ') else (' + b + '))';
        }
        if (lang === 'lua') {
            return '(((' + c + ') and (' + a + ')) or (' + b + '))';
        }
        return '((' + c + ') ? (' + a + ') : (' + b + '))';
    },

    doForever: function (block, defs) {
        var lang = this.language,
            body = this.emptyOr(this.mapInput(block.inputs()[0], defs)),
            code;
        if (lang === 'python') {
            code = 'while True:\n' + this.indentBlock(body, 4);
        } else if (lang === 'lua') {
            code = 'while true do\n' + this.indentBlock(body, 4) + '\nend';
        } else {
            code = 'while (true) {\n' + this.indentBlock(body, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    doRepeat: function (block, defs) {
        var lang = this.language,
            n = this.mapInput(block.inputs()[0], defs),
            body = this.emptyOr(this.mapInput(block.inputs()[1], defs)),
            code;
        if (lang === 'python') {
            code = 'for _ in range(int(' + n + ')):\n' + this.indentBlock(body, 4);
        } else if (lang === 'lua') {
            code = 'for _ = 1, ' + n + ' do\n' + this.indentBlock(body, 4) + '\nend';
        } else if (lang === 'java') {
            code = 'for (int _i = 0; _i < ((Number)(' + n +
                ')).intValue(); _i++) {\n' + this.indentBlock(body, 4) + '\n}';
        } else {
            code = 'for (let _i = 0; _i < ' + n + '; _i++) {\n' +
                this.indentBlock(body, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    doUntil: function (block, defs) {
        var lang = this.language,
            cond = this.mapInput(block.inputs()[0], defs),
            body = this.emptyOr(this.mapInput(block.inputs()[1], defs)),
            code;
        if (lang === 'python') {
            code = 'while not (' + cond + '):\n' + this.indentBlock(body, 4);
        } else if (lang === 'lua') {
            code = 'while not (' + cond + ') do\n' +
                this.indentBlock(body, 4) + '\nend';
        } else {
            code = 'while (!(' + cond + ')) {\n' +
                this.indentBlock(body, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    doFor: function (block, defs) {
        var lang = this.language,
            v = this.mapInput(block.inputs()[0], defs),
            a = this.mapInput(block.inputs()[1], defs),
            b = this.mapInput(block.inputs()[2], defs),
            body = this.emptyOr(this.mapInput(block.inputs()[3], defs)),
            code;
        if (lang === 'python') {
            code = 'for ' + v + ' in range(int(' + a + '), int(' + b +
                ') + 1):\n' + this.indentBlock(body, 4);
        } else if (lang === 'lua') {
            code = 'for ' + v + ' = ' + a + ', ' + b + ' do\n' +
                this.indentBlock(body, 4) + '\nend';
        } else if (lang === 'java') {
            code = 'for (int ' + v + ' = ((Number)(' + a +
                ')).intValue(); ' + v + ' <= ((Number)(' + b +
                ')).intValue(); ' + v + '++) {\n' +
                this.indentBlock(body, 4) + '\n}';
        } else {
            code = 'for (let ' + v + ' = ' + a + '; ' + v + ' <= ' + b +
                '; ' + v + '++) {\n' + this.indentBlock(body, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    doForEach: function (block, defs) {
        var lang = this.language,
            v = this.mapInput(block.inputs()[0], defs),
            list = this.mapInput(block.inputs()[1], defs),
            body = this.emptyOr(this.mapInput(block.inputs()[2], defs)),
            code;
        if (lang === 'python') {
            code = 'for ' + v + ' in ' + list + ':\n' +
                this.indentBlock(body, 4);
        } else if (lang === 'lua') {
            code = 'for _, ' + v + ' in ipairs(' + list + ') do\n' +
                this.indentBlock(body, 4) + '\nend';
        } else if (lang === 'java') {
            code = 'for (Object ' + v + ' : (Iterable<?>)(' + list +
                ')) {\n' + this.indentBlock(body, 4) + '\n}';
        } else {
            code = 'for (const ' + v + ' of ' + list + ') {\n' +
                this.indentBlock(body, 4) + '\n}';
        }
        return this.appendNext(block, defs, code);
    },

    doWarp: function (block, defs) {
        var body = this.mapInput(block.inputs()[0], defs);
        return this.appendNext(block, defs, body);
    },

    reifyScript: function (block, defs) {
        return this.emitRing(block, defs, 'script');
    },
    reifyReporter: function (block, defs) {
        return this.emitRing(block, defs, 'reporter');
    },
    reifyPredicate: function (block, defs) {
        return this.emitRing(block, defs, 'reporter');
    },

    bubble: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    doSayFor: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    doThink: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    doThinkFor: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    log: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    alert: function (block, defs) {
        return this.emitPrint(block, defs);
    },
    doAddToList: function (block, defs) {
        var val = this.mapInput(block.inputs()[0], defs),
            list = this.mapInput(block.inputs()[1], defs),
            lang = this.language,
            semi = (lang === 'javascript' || lang === 'java') ? ';' : '',
            code;
        if (lang === 'python') {
            code = '(' + list + ').append(' + val + ')';
        } else if (lang === 'javascript') {
            code = '(' + list + ').push(' + val + ');';
        } else {
            code = 'snap.add(' + val + ', ' + list + ')' + semi;
        }
        return this.appendNext(block, defs, code);
    },

    reportListItem: function (block, defs) {
        return this.emitIndexRead(block, defs, 'item');
    },
    reportLetter: function (block, defs) {
        return this.emitIndexRead(block, defs, 'letter');
    },
    doDeleteFromList: function (block, defs) {
        return this.emitIndexMutate(block, defs, 'delete');
    },
    doInsertInList: function (block, defs) {
        return this.emitIndexMutate(block, defs, 'insert');
    },
    doReplaceInList: function (block, defs) {
        return this.emitIndexMutate(block, defs, 'replace');
    },

    reportVariadicSum: function (block, defs) {
        return this.emitInfix(block, defs, '+', 'sum');
    },
    reportVariadicProduct: function (block, defs) {
        return this.emitInfix(block, defs, '*', 'product');
    },
    reportVariadicMin: function (block, defs) {
        return this.emitBuiltinCall(block, defs, 'min', 'min');
    },
    reportVariadicMax: function (block, defs) {
        return this.emitBuiltinCall(block, defs, 'max', 'max');
    },
    reportVariadicEquals: function (block, defs) {
        return this.emitInfix(block, defs,
            this.language === 'javascript' ? '===' : '==', 'equals');
    },
    reportVariadicNotEquals: function (block, defs) {
        return this.emitInfix(block, defs,
            this.language === 'javascript' ? '!==' : '!=', 'not_equals');
    },
    reportVariadicLessThan: function (block, defs) {
        return this.emitInfix(block, defs, '<', 'less');
    },
    reportVariadicLessThanOrEquals: function (block, defs) {
        return this.emitInfix(block, defs, '<=', 'less_eq');
    },
    reportVariadicGreaterThan: function (block, defs) {
        return this.emitInfix(block, defs, '>', 'greater');
    },
    reportVariadicGreaterThanOrEquals: function (block, defs) {
        return this.emitInfix(block, defs, '>=', 'greater_eq');
    },
    reportVariadicAnd: function (block, defs) {
        return this.emitInfix(block, defs,
            this.language === 'python' || this.language === 'lua' ? 'and' : '&&',
            'both');
    },
    reportVariadicOr: function (block, defs) {
        return this.emitInfix(block, defs,
            this.language === 'python' || this.language === 'lua' ? 'or' : '||',
            'either');
    },
    reportVariadicIsIdentical: function (block, defs) {
        if (this.language === 'python') {
            return this.emitInfix(block, defs, 'is', 'identical');
        }
        return this.emitInfix(block, defs, '===', 'identical');
    },

    reportJoinWords: function (block, defs) {
        var args = this.variadicArgs(block, defs),
            lang = this.language;
        if (!args.length) {
            return lang === 'python' ? '""' : (lang === 'lua' ? '""' : '""');
        }
        if (lang === 'python') {
            if (args.length === 1) { return 'str(' + args[0] + ')'; }
            return '(' + args.map(a => 'str(' + a + ')').join(' + ') + ')';
        }
        if (lang === 'javascript') {
            return args.length === 1 ? 'String(' + args[0] + ')' :
                '[' + args.join(', ') + '].join("")';
        }
        return this.emitVariadicCall(block, defs, 'join');
    },
    reportNewList: function (block, defs) {
        var args = this.variadicArgs(block, defs);
        if (this.language === 'lua') {
            return '{' + args.join(', ') + '}';
        }
        if (this.language === 'java') {
            return 'java.util.List.of(' + args.join(', ') + ')';
        }
        return '[' + args.join(', ') + ']';
    },
    reportConcatenatedLists: function (block, defs) {
        var args = this.variadicArgs(block, defs),
            lang = this.language;
        if (lang === 'python') {
            return args.length ? ('(' + args.map(a => 'list(' + a + ')').join(' + ') + ')') : '[]';
        }
        if (lang === 'javascript') {
            return '[].concat(' + args.join(', ') + ')';
        }
        return this.emitVariadicCall(block, defs, 'append_lists');
    },
    reportPipe: function (block, defs) {
        var value = this.mapInput(block.inputs()[0], defs),
            rings = this.variadicArgsFrom(block.inputs()[1], defs);
        return 'snap.pipe(' + [value].concat(rings).join(', ') + ')';
    },

    reportMonadic: function (block, defs) {
        var raw = block.inputs()[0] ? block.inputs()[0].evaluate() : '',
            key = raw instanceof Array ? String(raw[0]) : String(raw),
            n = this.mapInput(block.inputs()[1], defs),
            lang = this.language,
            table;
        if (lang === 'python') {
            table = {
                abs: 'abs(' + n + ')',
                neg: '(-' + n + ')',
                ceiling: 'math.ceil(' + n + ')',
                floor: 'math.floor(' + n + ')',
                sqrt: 'math.sqrt(' + n + ')',
                sin: 'math.sin(math.radians(' + n + '))',
                cos: 'math.cos(math.radians(' + n + '))',
                tan: 'math.tan(math.radians(' + n + '))',
                asin: 'math.degrees(math.asin(' + n + '))',
                acos: 'math.degrees(math.acos(' + n + '))',
                atan: 'math.degrees(math.atan(' + n + '))',
                ln: 'math.log(' + n + ')',
                log: 'math.log10(' + n + ')',
                'e^': 'math.exp(' + n + ')',
                '10^': '(10 ** ' + n + ')',
                '2^': '(2 ** ' + n + ')',
                id: '(' + n + ')',
                round: 'round(' + n + ')'
            };
            return table[key] || ('snap.monadic(' + this.quote(key) + ', ' + n + ')');
        }
        if (lang === 'javascript') {
            table = {
                abs: 'Math.abs(' + n + ')',
                neg: '(-' + n + ')',
                ceiling: 'Math.ceil(' + n + ')',
                floor: 'Math.floor(' + n + ')',
                sqrt: 'Math.sqrt(' + n + ')',
                sin: 'Math.sin(' + n + ' * Math.PI / 180)',
                cos: 'Math.cos(' + n + ' * Math.PI / 180)',
                tan: 'Math.tan(' + n + ' * Math.PI / 180)',
                ln: 'Math.log(' + n + ')',
                log: 'Math.log10(' + n + ')',
                'e^': 'Math.exp(' + n + ')',
                '10^': '(10 ** ' + n + ')',
                '2^': '(2 ** ' + n + ')',
                id: '(' + n + ')',
                round: 'Math.round(' + n + ')'
            };
            return table[key] || ('snap.monadic(' + this.quote(key) + ', ' + n + ')');
        }
        return 'snap.monadic(' + this.quote(key) + ', ' + n + ')';
    },

    reportBoolean: function (block, defs) {
        var v = block.inputs()[0] ? block.inputs()[0].evaluate() : false;
        return v ? this.profile().boolTrue : this.profile().boolFalse;
    },
    reportTrue: function () { return this.profile().boolTrue; },
    reportFalse: function () { return this.profile().boolFalse; },

    reportIsA: function (block, defs) {
        var v = this.mapInput(block.inputs()[0], defs),
            raw = block.inputs()[1] ? block.inputs()[1].evaluate() : '',
            key = raw instanceof Array ? String(raw[0]) : String(raw),
            lang = this.language;
        key = key.toLowerCase();
        if (lang === 'python') {
            if (key === 'number') {
                return 'isinstance(' + v + ', (int, float)) and not isinstance(' +
                    v + ', bool)';
            }
            if (key === 'text') { return 'isinstance(' + v + ', str)'; }
            if (key === 'list') { return 'isinstance(' + v + ', list)'; }
            if (key === 'boolean') { return 'isinstance(' + v + ', bool)'; }
        }
        return 'snap.is_a(' + v + ', ' + this.quote(key) + ')';
    },

    reportTextSplit: function (block, defs) {
        var text = this.mapInput(block.inputs()[0], defs),
            delim = this.mapInput(block.inputs()[1], defs),
            lang = this.language;
        if (lang === 'python') {
            return 'str(' + text + ').split(' + delim + ')';
        }
        if (lang === 'javascript') {
            return 'String(' + text + ').split(' + delim + ')';
        }
        return 'snap.split(' + text + ', ' + delim + ')';
    },

    reportListAttribute: function (block, defs) {
        var list = this.mapInput(block.inputs()[1], defs),
            raw = block.inputs()[0] ? block.inputs()[0].evaluate() : 'length',
            key = raw instanceof Array ? String(raw[0]) : String(raw),
            lang = this.language;
        if (String(key) === 'length' || !key) {
            if (lang === 'python') { return 'len(' + list + ')'; }
            if (lang === 'javascript') { return '(' + list + ').length'; }
        }
        return 'snap.list_attribute(' + this.quote(key) + ', ' + list + ')';
    },
    reportTextAttribute: function (block, defs) {
        var text = this.mapInput(block.inputs()[1], defs),
            lang = this.language;
        if (lang === 'python') { return 'len(str(' + text + '))'; }
        if (lang === 'javascript') { return 'String(' + text + ').length'; }
        return 'snap.text_attribute("length", ' + text + ')';
    },

        doDeclareVariables: function (block, defs) {
            // script variables %scriptVars — MultiArg of TemplateSlots
            // TemplateSlotMorph.evaluate already sanitizes via ident();
            // do not re-ident (that would create my_list vs my_list_2 collisions).
            var lang = this.language,
                names = this.variadicArgs(block, defs).map(n =>
                    String(n).replace(/['"]/g, '')
                ).filter(Boolean),
                code;
        if (!names.length) {
            code = this.profile().comment + ' script variables';
        } else if (lang === 'python') {
            code = names.map(n => n + ' = None').join('\n');
        } else if (lang === 'javascript') {
            code = 'let ' + names.join(', ') + ';';
        } else if (lang === 'java') {
            code = names.map(n => 'Object ' + n + ' = null;').join('\n');
        } else {
            code = 'local ' + names.join(', ');
        }
        return this.appendNext(block, defs, code);
    },

    doStopThis: function (block, defs) {
        var choice = block.inputs()[0] ? block.inputs()[0].evaluate() : 'this script',
            key = choice instanceof Array ? choice[0] : choice,
            lang = this.language,
            code;
        key = String(key || 'this script');
        if (key === 'all' || key.indexOf('all') !== -1) {
            code = lang === 'javascript' || lang === 'java' ?
                'snap.stop_all();' : 'snap.stop_all()';
        } else if (lang === 'javascript' || lang === 'java') {
            code = 'return;';
        } else {
            code = 'return';
        }
        return this.appendNext(block, defs, code);
    },

    reportMap: function (block, defs) {
        return this.emitMapKeep(block, defs, 'map');
    },
    reportAtomicMap: function (block, defs) {
        return this.specialEmitters.reportMap.call(this, block, defs);
    },
    reportKeep: function (block, defs) {
        return this.emitMapKeep(block, defs, 'keep');
    },
    reportAtomicKeep: function (block, defs) {
        return this.specialEmitters.reportKeep.call(this, block, defs);
    },
    reportFindFirst: function (block, defs) {
        var ring = block.inputs()[0],
            list = this.mapInput(block.inputs()[1], defs),
            parts = this.ringParts(ring, defs, 'same'),
            lang = this.language;
        if (lang === 'python' && parts) {
            return 'next((' + parts.param + ' for ' + parts.param +
                ' in ' + list + ' if ' + parts.body + '), None)';
        }
        if (lang === 'javascript' && parts) {
            return '(' + list + ').find((' + parts.param + ') => (' +
                parts.body + '))';
        }
        if (lang === 'javascript') {
            return '(' + list + ').find(' + this.mapInput(ring, defs) + ')';
        }
        return 'snap.find_first(' + this.mapInput(ring, defs) + ', ' + list + ')';
    },
    reportAtomicFindFirst: function (block, defs) {
        return this.specialEmitters.reportFindFirst.call(this, block, defs);
    },
    reportCombine: function (block, defs) {
        // combine %l using %repRing  →  reduce(ring, list)
        // Empty holes bind left-to-right (accumulator, item, …).
        var list = this.mapInput(block.inputs()[0], defs),
            ringMorph = block.inputs()[1],
            parts = this.ringParts(ringMorph, defs, 'sequential'),
            ring,
            lang = this.language;
        if (parts && parts.parms.length) {
            if (lang === 'python') {
                return 'reduce((lambda ' + parts.parms.join(', ') +
                    ': (' + parts.body + ')), ' + list + ')';
            }
            if (lang === 'javascript') {
                return '(' + list + ').reduce((' + parts.parms.join(', ') +
                    ') => (' + parts.body + '))';
            }
        }
        ring = this.mapInput(ringMorph, defs);
        if (lang === 'python') {
            return 'reduce(' + ring + ', ' + list + ')';
        }
        if (lang === 'javascript') {
            return '(' + list + ').reduce(' + ring + ')';
        }
        return 'snap.combine(' + list + ', ' + ring + ')';
    },
    reportAtomicCombine: function (block, defs) {
        return this.specialEmitters.reportCombine.call(this, block, defs);
    },

    doRun: function (block, defs) {
        var semi = (this.language === 'javascript' || this.language === 'java') ? ';' : '',
            ring = this.mapInput(block.inputs()[0], defs),
            args = this.variadicArgsFrom(block.inputs()[1], defs),
            call,
            lang = this.language;
        if (lang === 'python' || lang === 'javascript') {
            call = ring + '(' + args.join(', ') + ')' + semi;
        } else {
            call = 'snap.run(' + [ring].concat(args).join(', ') + ')' + semi;
        }
        return this.appendNext(block, defs, call);
    },
    fork: function (block, defs) {
        var semi = (this.language === 'javascript' || this.language === 'java') ? ';' : '',
            ring = this.mapInput(block.inputs()[0], defs),
            args = this.variadicArgsFrom(block.inputs()[1], defs),
            call = 'snap.launch(' + [ring].concat(args).join(', ') + ')' + semi;
        return this.appendNext(block, defs, call);
    },
    evaluate: function (block, defs) {
        var ring = this.mapInput(block.inputs()[0], defs),
            args = this.variadicArgsFrom(block.inputs()[1], defs),
            lang = this.language;
        if (lang === 'python' || lang === 'javascript') {
            return ring + '(' + args.join(', ') + ')';
        }
        return 'snap.call(' + [ring].concat(args).join(', ') + ')';
    },

    doBroadcast: function (block, defs) {
        var semi = (this.language === 'javascript' || this.language === 'java') ? ';' : '',
            msg = this.mapInput(block.inputs()[0], defs);
        return this.appendNext(
            block,
            defs,
            'snap.broadcast(' + msg + ')' + semi
        );
    },
    doBroadcastAndWait: function (block, defs) {
        var lang = this.language,
            msg = this.mapInput(block.inputs()[0], defs),
            code;
        if (lang === 'javascript') {
            code = 'await snap.broadcast_and_wait(' + msg + ');';
        } else if (lang === 'java') {
            code = 'snap.broadcast_and_wait(' + msg + ');';
        } else {
            code = 'snap.broadcast_and_wait(' + msg + ')';
        }
        return this.appendNext(block, defs, code);
    }
};

SnapCodifier.variadicArgsFrom = function (slot, defs) {
    if (!slot) { return []; }
    if (slot.inputs && typeof slot.inputs === 'function') {
        return slot.inputs().map(inp => this.mapInput(inp, defs));
    }
    var single = this.mapInput(slot, defs);
    return single ? [single] : [];
};

SnapCodifier.variadicArgs = function (block, defs) {
    // First input is typically a MultiArg for variadic reporters
    var slot = block.inputs()[0];
    return this.variadicArgsFrom(slot, defs);
};

SnapCodifier.emitVariadicCall = function (block, defs, fn) {
    var args = this.variadicArgs(block, defs);
    return 'snap.' + fn + '(' + args.join(', ') + ')';
};

SnapCodifier.emitInfix = function (block, defs, op, snapFn) {
    var args = this.variadicArgs(block, defs),
        lang = this.language;
    if (!args.length) {
        return lang === 'python' ? 'None' : 'null';
    }
    if (args.length === 1) {
        return '(' + args[0] + ')';
    }
    // Idiomatic infix for Python / JS / Lua; Java falls back to snap.*
    if (lang === 'java') {
        return this.emitVariadicCall(block, defs, snapFn);
    }
    return '(' + args.join(' ' + op + ' ') + ')';
};

SnapCodifier.emitBuiltinCall = function (block, defs, pyName, snapFn) {
    var args = this.variadicArgs(block, defs),
        lang = this.language;
    if (lang === 'python') {
        return pyName + '(' + args.join(', ') + ')';
    }
    if (lang === 'javascript') {
        return 'Math.' + pyName + '(' + args.join(', ') + ')';
    }
    return this.emitVariadicCall(block, defs, snapFn);
};

SnapCodifier.optionKey = function (slot) {
    var val;
    if (!slot || typeof slot.evaluate !== 'function') { return null; }
    val = slot.evaluate();
    if (val instanceof Array) { return String(val[0]); }
    if (typeof val === 'string' &&
            contains(['last', 'any', 'random', 'all', 'parent'], val)) {
        return val;
    }
    return null;
};

SnapCodifier.emitIndexRead = function (block, defs, kind) {
    var idxSlot = block.inputs()[0],
        col = this.mapInput(block.inputs()[1], defs),
        idx = this.mapInput(idxSlot, defs),
        key = this.optionKey(idxSlot),
        lang = this.language;

    if (lang === 'python') {
        if (kind === 'letter') {
            col = 'str(' + col + ')';
        }
        if (key === 'last') { return '(' + col + ')[-1]'; }
        if (key === 'any' || key === 'random') {
            return 'random.choice(' + col + ')';
        }
        return '(' + col + ')[(' + idx + ') - 1]';
    }
    if (lang === 'javascript') {
        if (kind === 'letter') {
            if (key === 'last') {
                return 'String(' + col + ').slice(-1)';
            }
            if (key === 'any' || key === 'random') {
                return 'String(' + col + ')[Math.floor(Math.random()*String(' +
                    col + ').length)]';
            }
            return 'String(' + col + ')[(' + idx + ') - 1]';
        }
        if (key === 'last') { return '(' + col + ').at(-1)'; }
        if (key === 'any' || key === 'random') {
            return '(' + col + ')[Math.floor(Math.random()*(' + col + ').length)]';
        }
        return '(' + col + ')[(' + idx + ') - 1]';
    }
    return kind === 'letter' ?
        ('snap.letter(' + idx + ', ' + col + ')') :
        ('snap.item(' + idx + ', ' + col + ')');
};

SnapCodifier.emitIndexMutate = function (block, defs, kind) {
    var semi = (this.language === 'javascript' || this.language === 'java') ? ';' : '',
        lang = this.language,
        code;

    if (kind === 'delete') {
        var idxSlot = block.inputs()[0],
            list = this.mapInput(block.inputs()[1], defs),
            idx = this.mapInput(idxSlot, defs),
            key = this.optionKey(idxSlot);
        if (lang === 'python') {
            if (key === 'all') { code = '(' + list + ').clear()'; }
            else if (key === 'last') { code = '(' + list + ').pop()'; }
            else { code = 'del (' + list + ')[(' + idx + ') - 1]'; }
        } else if (lang === 'javascript') {
            if (key === 'all') { code = '(' + list + ').length = 0;'; }
            else if (key === 'last') { code = '(' + list + ').pop();'; }
            else { code = '(' + list + ').splice((' + idx + ') - 1, 1);'; }
        } else {
            code = 'snap.delete(' + idx + ', ' + list + ')' + semi;
        }
        return this.appendNext(block, defs, code);
    }

    if (kind === 'insert') {
        var val = this.mapInput(block.inputs()[0], defs),
            idxSlot2 = block.inputs()[1],
            list2 = this.mapInput(block.inputs()[2], defs),
            idx2 = this.mapInput(idxSlot2, defs),
            key2 = this.optionKey(idxSlot2);
        if (lang === 'python') {
            if (key2 === 'last') {
                code = '(' + list2 + ').append(' + val + ')';
            } else {
                code = '(' + list2 + ').insert((' + idx2 + ') - 1, ' + val + ')';
            }
        } else if (lang === 'javascript') {
            if (key2 === 'last') {
                code = '(' + list2 + ').push(' + val + ');';
            } else {
                code = '(' + list2 + ').splice((' + idx2 + ') - 1, 0, ' + val + ');';
            }
        } else {
            code = 'snap.insert(' + val + ', ' + idx2 + ', ' + list2 + ')' + semi;
        }
        return this.appendNext(block, defs, code);
    }

    // replace: inputs idx, list, value
    var idxSlot3 = block.inputs()[0],
        list3 = this.mapInput(block.inputs()[1], defs),
        val3 = this.mapInput(block.inputs()[2], defs),
        idx3 = this.mapInput(idxSlot3, defs),
        key3 = this.optionKey(idxSlot3);
    if (lang === 'python') {
        if (key3 === 'last') {
            code = '(' + list3 + ')[-1] = ' + val3;
        } else {
            code = '(' + list3 + ')[(' + idx3 + ') - 1] = ' + val3;
        }
    } else if (lang === 'javascript') {
        if (key3 === 'last') {
            code = '(' + list3 + ')[(' + list3 + ').length - 1] = ' + val3 + ';';
        } else {
            code = '(' + list3 + ')[(' + idx3 + ') - 1] = ' + val3 + ';';
        }
    } else {
        code = 'snap.replace(' + idx3 + ', ' + list3 + ', ' + val3 + ')' + semi;
    }
    return this.appendNext(block, defs, code);
};

SnapCodifier.ringParts = function (ring, defs, mode) {
    // Pull parameter name + body out of a reify* ring for list comps / reduce.
    // mode: 'same' (map/keep — every hole is the item) | 'sequential' (combine)
    var parmsSlot, bodySlot, parms, body, param, resolved, holeMode;
    if (!ring || !ring.selector || ring.selector.substr(0, 5) !== 'reify') {
        return null;
    }
    holeMode = mode || 'same';
    bodySlot = ring.inputs()[0];
    parmsSlot = ring.inputs()[1];
    parms = this.variadicArgsFrom(parmsSlot, defs)
        .map(p => this.ident(String(p).replace(/['"]/g, '')));
    resolved = this.resolveRingFormals(ring, parms, holeMode);
    parms = resolved.parms;
    param = parms[0] || this.ident('x');
    if (resolved.bindings) {
        body = this.withHoleBindings(resolved.bindings, () =>
            this.mapInput(bodySlot, defs)
        );
    } else {
        body = this.mapInput(bodySlot, defs);
    }
    if (!body && body !== 0) { body = param; }
    return {param: param, body: body, parms: parms};
};

SnapCodifier.emitPrint = function (block, defs) {
    var msg = this.mapInput(block.inputs()[0], defs),
        lang = this.language,
        code;
    if (lang === 'python') {
        code = 'print(' + msg + ')';
    } else if (lang === 'javascript') {
        code = 'console.log(' + msg + ');';
    } else if (lang === 'lua') {
        code = 'print(' + msg + ')';
    } else {
        code = 'System.out.println(' + msg + ');';
    }
    return this.appendNext(block, defs, code);
};

SnapCodifier.emitMapKeep = function (block, defs, kind) {
    var ring = block.inputs()[0],
        list = this.mapInput(block.inputs()[1], defs),
        parts = this.ringParts(ring, defs, 'same'),
        lang = this.language,
        ringCode;

    if (parts) {
        if (lang === 'python') {
            if (kind === 'map') {
                return '[' + parts.body + ' for ' + parts.param +
                    ' in ' + list + ']';
            }
            return '[' + parts.param + ' for ' + parts.param + ' in ' + list +
                ' if ' + parts.body + ']';
        }
        if (lang === 'javascript') {
            if (kind === 'map') {
                return '(' + list + ').map((' + parts.param + ') => (' +
                    parts.body + '))';
            }
            return '(' + list + ').filter((' + parts.param + ') => (' +
                parts.body + '))';
        }
    }
    ringCode = this.mapInput(ring, defs);
    if (lang === 'javascript') {
        return kind === 'map' ?
            '(' + list + ').map(' + ringCode + ')' :
            '(' + list + ').filter(' + ringCode + ')';
    }
    return kind === 'map' ?
        ('snap.map(' + ringCode + ', ' + list + ')') :
        ('snap.keep(' + ringCode + ', ' + list + ')');
};

SnapCodifier.emitRing = function (block, defs, kind) {
    var lang = this.language,
        inputs = block.inputs(),
        bodySlot = inputs[0],
        parmsSlot = inputs[1],
        parms,
        body,
        code,
        resolved,
        paramList;

    parms = this.variadicArgsFrom(parmsSlot, defs)
        .map(p => this.ident(String(p).replace(/['"]/g, '')));
    // Standalone rings: empty holes → sequential implicit formals (a, b, …)
    resolved = this.resolveRingFormals(block, parms, 'sequential');
    parms = resolved.parms;
    if (resolved.bindings) {
        body = this.withHoleBindings(resolved.bindings, () =>
            this.mapInput(bodySlot, defs)
        );
    } else {
        body = this.mapInput(bodySlot, defs);
    }
    if (kind === 'script') {
        body = this.emptyOr(body);
    }
    paramList = parms.join(', ');

    if (lang === 'python') {
        if (kind === 'script') {
            code = '(lambda ' + paramList +
                ': snap.script(lambda: (\n' +
                this.indentBlock(body, 4) + '\n)))';
        } else {
            code = '(lambda ' + paramList + ': (' + body + '))';
        }
    } else if (lang === 'javascript') {
        if (kind === 'script') {
            code = '((' + paramList + ') => {\n' +
                this.indentBlock(body, 4) + '\n})';
        } else {
            code = '((' + paramList + ') => (' + body + '))';
        }
    } else if (lang === 'java') {
        if (kind === 'script') {
            code = '((' + paramList + ') -> {\n' +
                this.indentBlock(body, 4) + '\n})';
        } else {
            code = '((' + paramList + ') -> (' + body + '))';
        }
    } else { // lua
        if (kind === 'script') {
            code = '(function(' + paramList + ')\n' +
                this.indentBlock(body, 4) + '\nend)';
        } else {
            code = '(function(' + paramList +
                ') return ' + body + ' end)';
        }
    }
    return code;
};


// ---- custom blocks → functions --------------------------------------

SnapCodifier.functionSignature = function (definition) {
    var name = this.specToFunctionName(definition.spec),
        params = this.inputNamesOf(definition),
        lang = this.language,
        p = this.profile(),
        paramList = params.join(', '),
        empty = !definition.body || !definition.body.expression,
        header,
        call,
        i,
        callArgs = [];

    for (i = 1; i <= Math.max(params.length, definition.declarations ?
            definition.declarations.size : 0); i += 1) {
        callArgs.push('<#' + i + '>');
    }
    if (!callArgs.length && params.length) {
        callArgs = params.map((_, idx) => '<#' + (idx + 1) + '>');
    }
    call = name + '(' + callArgs.join(', ') + ')';
    if (!empty && definition.type === 'command' &&
            (lang === 'javascript' || lang === 'java')) {
        call = call + ';';
    }

    if (lang === 'python') {
        header = empty ?
            ('def ' + name + '(' + paramList + '):\n    ' + p.emptyBody) :
            ('def ' + name + '(' + paramList + '):\n    <body>');
    } else if (lang === 'javascript') {
        header = empty ?
            ('function ' + name + '(' + paramList + ') {\n    ' +
                p.emptyBody + '\n}') :
            ('function ' + name + '(' + paramList + ') {\n    <body>\n}');
    } else if (lang === 'java') {
        header = empty ?
            ('public static Object ' + name + '(' +
                params.map(n => 'Object ' + n).join(', ') +
                ') {\n    ' + p.emptyBody + '\n    return null;\n}') :
            ('public static Object ' + name + '(' +
                params.map(n => 'Object ' + n).join(', ') +
                ') {\n    <body>\n}');
    } else {
        header = empty ?
            ('function ' + name + '(' + paramList + ')\n    ' +
                p.emptyBody + '\nend') :
            ('function ' + name + '(' + paramList + ')\n    <body>\nend');
    }

    return {name: name, header: header, call: call, params: params};
};

SnapCodifier.collectDefinitions = function (ide) {
    var defs = [],
        seen = new Set(),
        add = function (list) {
            if (!list) { return; }
            list.forEach(def => {
                if (!def || seen.has(def)) { return; }
                seen.add(def);
                defs.push(def);
            });
        };
    if (!ide) { return defs; }
    if (ide.stage) {
        add(ide.stage.globalBlocks);
        add(ide.stage.customBlocks);
    }
    if (ide.sprites && ide.sprites.asArray) {
        ide.sprites.asArray().forEach(spr => add(spr.customBlocks));
    }
    if (ide.currentSprite) {
        add(ide.currentSprite.customBlocks);
    }
    return defs;
};

    SnapCodifier.installCustomMappings = function (ide) {
        var backups = [];
        this.collectDefinitions(ide).forEach(def => {
            var sig;
            if (!def || !def.spec) { return; }
            sig = this.functionSignature(def);
            backups.push({
                def: def,
                codeMapping: def.codeMapping,
                codeHeader: def.codeHeader
            });
            def.codeHeader = sig.header;
            def.codeMapping = sig.call;
        });
        this._customBackups = backups;
    };

SnapCodifier.restoreCustomMappings = function () {
    if (!this._customBackups) { return; }
    this._customBackups.forEach(b => {
        b.def.codeMapping = b.codeMapping;
        b.def.codeHeader = b.codeHeader;
    });
    this._customBackups = null;
};

SnapCodifier.blockFallback = function (block) {
    var label;
    try {
        label = block.abstractBlockSpec ? block.abstractBlockSpec()
            : (block.blockSpec || block.selector || 'block');
    } catch (err) {
        label = block.selector || 'block';
    }
    return this.profile().comment + ' [unmapped: ' + label + ']';
};

SnapCodifier.ensureFallbacks = function (block) {
    var cursor = block,
        sel,
        nested;
    while (cursor instanceof BlockMorph) {
        sel = cursor.selector;
        if (!cursor.isCustomBlock &&
                sel &&
                sel !== 'reportGetVar' &&
                !this.specialEmitters[sel] &&
                !StageMorph.prototype.codeMappings[sel]) {
            StageMorph.prototype.codeMappings[sel] =
                this.blockFallback(cursor);
        }
        cursor.inputs().forEach(input => {
            if (input instanceof BlockMorph) {
                this.ensureFallbacks(input);
            } else if (input && input.nestedBlock) {
                nested = input.nestedBlock();
                if (nested) { this.ensureFallbacks(nested); }
            }
        });
        cursor = cursor.nextBlock ? cursor.nextBlock() : null;
    }
};

    SnapCodifier.mapBlock = function (block) {
        if (!(block instanceof BlockMorph)) {
            return '';
        }
        try {
            this.ensureFallbacks(block);
            return block.mappedCode() || this.blockFallback(block);
        } catch (err) {
            return this.blockFallback(block) + '\n' +
                this.profile().comment + ' export error: ' + err;
        }
    };

SnapCodifier.scriptsOf = function (sprite) {
    if (!sprite || !sprite.scripts) {
        return [];
    }
    return sprite.scripts.sortedElements().filter(each =>
        each instanceof BlockMorph
    );
};

SnapCodifier.generateForSprite = function (sprite) {
    var meta = this.profile(),
        scripts = this.scriptsOf(sprite),
        chunks = [],
        header,
        body;
    if (!scripts.length) {
        return '';
    }
    header = meta.comment + ' ' + (sprite.name || 'Sprite');
    scripts.forEach(script => {
        body = this.mapBlock(script);
        if (body && String(body).trim()) {
            chunks.push(body);
        }
    });
    if (!chunks.length) {
        return header + '\n';
    }
    return header + '\n\n' + chunks.join('\n\n') + '\n';
};

SnapCodifier.withTranslationContext = function (ide, fn) {
    var myself = this,
        targetMaps = StageMorph.prototype.codeMappings,
        previousMaps = Object.assign({}, targetMaps),
        key,
        origBlockMapped = BlockMorph.prototype.mappedCode,
        origInputMapped = InputSlotMorph.prototype.mappedCode,
        origMultiMapped = MultiArgMorph.prototype.mappedCode,
        origTemplateEval = TemplateSlotMorph.prototype.evaluate,
        origBoolMapped = BooleanSlotMorph.prototype.mappedCode,
        result;

    this._identCache = {};
    this.applyLanguage(this.language);
    this.installCustomMappings(ide);

    BlockMorph.prototype.mappedCode = function (definitions) {
        var code, next, emitter, defs, sig;
        if (this.selector === 'reportGetVar') {
            code = myself.ident(this.blockSpec);
            if (this.nextBlock && this.nextBlock()) {
                next = this.nextBlock().mappedCode(definitions);
                if (next) { code += '\n' + next; }
            }
            return code;
        }
        // Local custom blocks null out .definition (Snap perf); resolve it.
        if (this.isCustomBlock) {
            var def = this.definition,
                rcvr;
            if (!def && typeof this.scriptTarget === 'function') {
                rcvr = this.scriptTarget();
                if (rcvr && typeof rcvr.getMethod === 'function') {
                    def = rcvr.getMethod(this.semanticSpec || this.blockSpec);
                }
            }
            if (!def) {
                code = myself.profile().comment + ' [custom block]';
                return myself.appendNext(this, definitions || {}, code);
            }
            if (!def.codeMapping) {
                sig = myself.functionSignature(def);
                def.codeHeader = sig.header;
                def.codeMapping = sig.call;
            }
            // Temporarily restore definition for stock mappedCode / headers
            if (!this.definition) {
                this.definition = def;
                try {
                    code = origBlockMapped.call(this, definitions);
                } finally {
                    this.definition = null;
                }
                return code;
            }
        }
        emitter = myself.specialEmitters[this.selector];
        if (emitter) {
            defs = definitions || {};
            code = emitter.call(myself, this, defs);
            if (!definitions) {
                var headers = [];
                Object.keys(defs).forEach(each => {
                    if (defs[each]) { headers.push(defs[each]); }
                });
                if (headers.length) {
                    return headers.join('\n\n') + '\n\n' + code;
                }
            }
            return code;
        }
        try {
            return origBlockMapped.call(this, definitions);
        } catch (err) {
            code = myself.blockFallback(this);
            return myself.appendNext(this, definitions || {}, code);
        }
    };

    InputSlotMorph.prototype.mappedCode = function () {
        var block = this.parentThatIsA(BlockMorph),
            val,
            opt,
            mapped;
        // Empty ring holes → bound implicit formals (not numeric 0 / '')
        if (myself._holeBindings && myself._holeBindings.has(this)) {
            return myself._holeBindings.get(this);
        }
        val = this.evaluate();
        if (block && contains(
                ['doSetVar', 'doChangeVar', 'doShowVar', 'doHideVar'],
                block.selector
            )) {
            if (block.inputs()[0] === this) {
                return myself.ident(val);
            }
        }
        opt = myself.optionLiteral(val);
        if (opt !== null) {
            return opt;
        }
        if (val instanceof Array) {
            // other menu constants (e.g. math op names, types)
            return myself.quote(String(val[0]));
        }
        mapped = origInputMapped.call(this);
        return mapped;
    };

    MultiArgMorph.prototype.mappedCode = function (definitions) {
        var mode = myself._multiArgMode,
            block = this.parentThatIsA(BlockMorph),
            key = '',
            code,
            itemCode,
            delim,
            parts = [],
            count = 0,
            items = '';

        if (mode) {
            delim = mode.delim;
            itemCode = mode.item || '<#1>';
            code = mode.list || '<#1>';
        } else {
            if (block) {
                if (block instanceof RingMorph) {
                    key = 'parms_';
                } else if (block.selector === 'doDeclareVariables') {
                    key = 'tempvars_';
                }
            }
            code = StageMorph.prototype.codeMappings[key + 'list'] || '<#1>';
            itemCode = StageMorph.prototype.codeMappings[key + 'item'] || '<#1>';
            delim = StageMorph.prototype.codeMappings[key + 'delim'] || ' ';
        }

        this.inputs().forEach(input =>
            parts.push(itemCode.replace(/<#1>/g, input.mappedCode(definitions)))
        );
        parts.forEach(part => {
            if (count) { items += delim; }
            items += part;
            count += 1;
        });
        return code.replace(/<#1>/g, items);
    };

    TemplateSlotMorph.prototype.evaluate = function () {
        return myself.ident(this.contents());
    };

    BooleanSlotMorph.prototype.mappedCode = function () {
        var val;
        if (myself._holeBindings && myself._holeBindings.has(this)) {
            return myself._holeBindings.get(this);
        }
        val = this.evaluate();
        if (val === true) { return myself.profile().boolTrue; }
        if (val === false) { return myself.profile().boolFalse; }
        return origBoolMapped.call(this);
    };

    try {
        result = fn.call(this);
    } finally {
        BlockMorph.prototype.mappedCode = origBlockMapped;
        InputSlotMorph.prototype.mappedCode = origInputMapped;
        MultiArgMorph.prototype.mappedCode = origMultiMapped;
        TemplateSlotMorph.prototype.evaluate = origTemplateEval;
        BooleanSlotMorph.prototype.mappedCode = origBoolMapped;
        this.restoreCustomMappings();
        for (key in targetMaps) {
            if (Object.prototype.hasOwnProperty.call(targetMaps, key)) {
                delete targetMaps[key];
            }
        }
        Object.assign(targetMaps, previousMaps);
        this._identCache = null;
    }
    return result;
};

SnapCodifier.titleLine = function () {
    var p = this.profile();
    return p.comment + ' ' + p.label + ' from your Snap! blocks';
};

SnapCodifier.studentImports = function () {
    // Small stdlib imports so idiomatic output runs without the snap helpers.
    if (this.language === 'python') {
        return 'import math\nimport random\nfrom functools import reduce\n';
    }
    return '';
};

SnapCodifier.helpersBanner = function () {
    return this.profile().comment +
        ' Helpers (needed to run this file — you can ignore the details)';
};

SnapCodifier.runtimeBlock = function () {
    var runtime = this.runtimes[this.language] || '';
    if (!runtime) {
        return '';
    }
    return this.helpersBanner() + '\n' + runtime;
};

SnapCodifier.epilogue = function () {
    if (this.language === 'java') {
        return '\n    }\n}\n';
    }
    return '';
};

// options.helpers:
//   false / 'none'  — live pane (default): just the student's scripts
//   true  / 'start' — export/copy: helpers first so the file can run
SnapCodifier.generate = function (ide, options) {
    var meta = this.profile(),
        myself = this,
        opts = options || {},
        withHelpers = opts.helpers === true || opts.helpers === 'start';

    if (!ide) {
        return this.titleLine() + '\n\n' + meta.empty;
    }

    return this.withTranslationContext(ide, function () {
        var parts = [],
            text,
            stage,
            body,
            out,
            lang = myself.language;

        if (myself.scope === 'all') {
            stage = ide.stage;
            if (stage) {
                text = myself.generateForSprite(stage);
                if (text) { parts.push(text); }
            }
            if (ide.sprites && ide.sprites.asArray) {
                ide.sprites.asArray().forEach(spr => {
                    text = myself.generateForSprite(spr);
                    if (text) { parts.push(text); }
                });
            }
        } else {
            text = myself.generateForSprite(ide.currentSprite || ide.stage);
            if (text) { parts.push(text); }
        }

        // Student-facing: short title, light imports, then their code.
        out = myself.titleLine() + '\n\n';
        if (!parts.length) {
            return out + meta.empty;
        }
        body = parts.join('\n').replace(/^\n+/, '');

        if (lang === 'java') {
            if (withHelpers) {
                out += myself.runtimeBlock() + '\n\n';
            }
            out += 'public class SnapExport {\n';
            out += '    public static void main(String[] args) {\n\n';
            out += body.split('\n').map(line =>
                line.length ? '        ' + line : ''
            ).join('\n');
            out += myself.epilogue();
            return out;
        }

        var imports = myself.studentImports();
        if (imports) {
            out += imports + '\n';
        }
        if (withHelpers) {
            out += myself.runtimeBlock() + '\n\n';
        }
        out += body;
        if (!out.endsWith('\n')) {
            out += '\n';
        }
        return out;
    });
};


// CodePaneMorph ///////////////////////////////////////////////////////
//
// Docked side panel: live textual view of the current Snap scripts.

CodePaneMorph.prototype = new Morph();
CodePaneMorph.prototype.constructor = CodePaneMorph;
CodePaneMorph.uber = Morph.prototype;

CodePaneMorph.prototype.defaultWidth = 420;

function CodePaneMorph(ide) {
    this.init(ide);
}

CodePaneMorph.prototype.init = function (ide) {
    CodePaneMorph.uber.init.call(this);
    this.ide = ide;
    this.color = ide ? ide.groupColor : new Color(40, 40, 40);
    this.cachedCode = '';
    this.fps = 2;
    this.build();
};

CodePaneMorph.prototype.styleButton = function (btn, colors, labelColor) {
    // Match Snap control-bar buttons: no white label shadow (avoids "double text").
    btn.corner = 8;
    btn.padding = 1;
    btn.color = colors[0];
    btn.highlightColor = colors[1];
    btn.pressColor = colors[2];
    btn.labelColor = labelColor;
    btn.labelShadowColor = colors[0].darker(40);
    btn.labelShadowOffset = ZERO;
    btn.contrast = 30;
    btn.createLabel();
    btn.fixLayout();
    return btn;
};

CodePaneMorph.prototype.refreshButtonLabels = function () {
    if (this.langButton) {
        this.langButton.labelString = SnapCodifier.currentMeta().label;
        this.langButton.createLabel();
        this.langButton.fixLayout();
    }
    if (this.scopeButton) {
        this.scopeButton.labelString = SnapCodifier.scope === 'all' ?
            localize('All sprites') : localize('This sprite');
        this.scopeButton.createLabel();
        this.scopeButton.fixLayout();
    }
};

CodePaneMorph.prototype.build = function () {
    var ide = this.ide,
        colors = ide && ide.isBright ? ide.tabColors : [
            ide.groupColor,
            ide.frameColor.darker(40),
            ide.frameColor.darker(40)
        ],
        labelColor = ide.isBright ? new Color(40, 40, 40) : WHITE,
        textColor = ide.isBright ?
            new Color(30, 30, 30) : new Color(210, 230, 210),
        btn;

    this.children.slice().forEach(child => child.destroy());

    // Header bar
    this.header = new Morph();
    this.header.color = ide.frameColor;
    this.add(this.header);

    this.title = new StringMorph(
        localize('Live Code'),
        12,
        null,
        true,
        false,
        false,
        ZERO,
        null,
        labelColor
    );
    this.header.add(this.title);

    btn = new PushButtonMorph(
        this,
        'chooseLanguage',
        SnapCodifier.currentMeta().label,
        null,
        localize('choose output language')
    );
    btn.labelMinExtent = new Point(64, 18);
    this.langButton = this.styleButton(btn, colors, labelColor);
    this.header.add(btn);

    btn = new PushButtonMorph(
        this,
        'toggleScope',
        SnapCodifier.scope === 'all' ?
            localize('All sprites') : localize('This sprite'),
        null,
        localize('toggle current sprite / all sprites')
    );
    btn.labelMinExtent = new Point(72, 18);
    this.scopeButton = this.styleButton(btn, colors, labelColor);
    this.header.add(btn);

    btn = new PushButtonMorph(
        this,
        'copyCode',
        localize('Copy'),
        null,
        localize('copy generated code')
    );
    this.copyButton = this.styleButton(btn, colors, labelColor);
    this.header.add(btn);

    btn = new PushButtonMorph(
        this,
        'exportCode',
        localize('Export'),
        null,
        localize('download generated code as a file')
    );
    this.exportButton = this.styleButton(btn, colors, labelColor);
    this.header.add(btn);

    btn = new PushButtonMorph(
        this,
        'closePane',
        new SymbolMorph('cross', 10),
        null,
        localize('close live code pane')
    );
    this.closeButton = this.styleButton(btn, colors, labelColor);
    this.header.add(btn);

    // Code body — TextMorph color is a property, not a constructor arg
    this.codeBody = new TextMorph(
        SnapCodifier.currentMeta().empty,
        12,
        'monospace',
        false,
        false,
        'left',
        0,
        'monospace'
    );
    this.codeBody.color = textColor;
    this.codeBody.isEditable = false;
    this.codeBody.enableSelecting();
    this.codeBody.maxWidth = 0;
    this.codeBody.fixLayout();

    // ScrollFrameMorph expects a FrameMorph as contents; add the text into it.
    this.scroller = new ScrollFrameMorph(null, null, ide.sliderColor);
    this.scroller.color = ide.isBright ?
        new Color(250, 250, 252) : new Color(22, 26, 22);
    this.scroller.acceptsDrops = false;
    this.scroller.contents.acceptsDrops = false;
    this.scroller.contents.color = this.scroller.color;
    this.scroller.isTextLineWrapping = true;
    this.scroller.padding = 6;
    this.scroller.setContents(this.codeBody);
    this.add(this.scroller);
};

CodePaneMorph.prototype.chooseLanguage = function () {
    var menu = new MenuMorph(this),
        myself = this;
    Object.keys(SnapCodifier.languages).forEach(id => {
        var meta = SnapCodifier.languages[id],
            tick = (SnapCodifier.language === id) ? '\u2713 ' : '    ';
        menu.addItem(
            tick + meta.label,
            () => {
                SnapCodifier.language = id;
                myself.refresh(true);
                myself.refreshButtonLabels();
                myself.fixLayout();
            }
        );
    });
    menu.popUpAtHand(this.world());
};

CodePaneMorph.prototype.toggleScope = function () {
    SnapCodifier.scope = SnapCodifier.scope === 'all' ? 'sprite' : 'all';
    this.refreshButtonLabels();
    this.refresh(true);
    this.fixLayout();
};

CodePaneMorph.prototype.codeForExport = function () {
    // Include helpers so copied/exported files can run outside Snap!
    return SnapCodifier.generate(this.ide, {helpers: true});
};

CodePaneMorph.prototype.copyCode = function () {
    var text = this.codeForExport(),
        ide = this.ide;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            () => ide.showMessage(localize('Code copied'), 1),
            () => this.fallbackCopy(text)
        );
    } else {
        this.fallbackCopy(text);
    }
};

CodePaneMorph.prototype.fallbackCopy = function (text) {
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
        document.execCommand('copy');
        this.ide.showMessage(localize('Code copied'), 1);
    } catch (err) {
        this.ide.showMessage(localize('Could not copy'), 2);
    }
    document.body.removeChild(area);
};

CodePaneMorph.prototype.exportCode = function () {
    var meta = SnapCodifier.currentMeta(),
        ide = this.ide,
        name = (ide.getProjectName && ide.getProjectName()) || 'snap-export',
        safe = SnapCodifier.sanitizeIdentifier(name),
        text = this.codeForExport(),
        blob,
        fileName = safe + '.' + meta.ext;
    try {
        blob = new Blob(
            [text],
            {type: meta.mime + ';charset=utf-8'}
        );
        if (typeof saveAs === 'function') {
            saveAs(blob, fileName, false);
            ide.showMessage(localize('Exported') + ' ' + fileName, 2);
            return;
        }
    } catch (err) {
        // fall through to IDE helper
    }
    ide.saveFileAs(text, 'text/plain;charset=utf-8', safe);
};

CodePaneMorph.prototype.closePane = function () {
    if (this.ide && this.ide.toggleCodePane) {
        this.ide.toggleCodePane(false);
    }
};

CodePaneMorph.prototype.refresh = function (force) {
    var code;
    if (!this.ide || !this.codeBody || !this.scroller) { return; }
    code = SnapCodifier.generate(this.ide);
    if (!force && code === this.cachedCode) { return; }
    this.cachedCode = code;
    this.codeBody.text = code;
    this.codeBody.fixLayout();
    this.codeBody.rerender();
    this.scroller.contents.adjustBounds();
    this.scroller.adjustScrollBars();
};

CodePaneMorph.prototype.step = function () {
    if (!this.isVisible) { return; }
    this.refresh(false);
};

CodePaneMorph.prototype.fixLayout = function () {
    var pad = 8,
        rowH = 26,
        headerH = rowH * 2 + 10,
        x = this.left() + pad,
        y = this.top() + pad,
        innerW = Math.max(80, this.width() - pad * 2),
        innerH,
        row1Y,
        row2Y,
        cursorX,
        gap = 4;

    if (!this.header || !this.scroller || !this.codeBody) { return; }

    this.header.setPosition(new Point(x, y));
    this.header.setExtent(new Point(innerW, headerH));

    row1Y = this.header.top() + 4;
    row2Y = this.header.top() + rowH + 6;

    // Row 1: title + close
    this.title.setTop(row1Y + 4);
    this.title.setLeft(this.header.left() + 6);
    if (this.closeButton) {
        this.closeButton.setTop(row1Y);
        this.closeButton.setRight(this.header.right() - 4);
    }

    // Row 2: language, scope, copy, export
    cursorX = this.header.left() + 4;
    [this.langButton, this.scopeButton, this.copyButton, this.exportButton]
        .forEach(button => {
            if (!button) { return; }
            button.setTop(row2Y);
            button.setLeft(cursorX);
            cursorX = button.right() + gap;
        });

    y = this.header.bottom() + pad;
    innerH = Math.max(40, this.bottom() - y - pad);
    this.scroller.setPosition(new Point(x, y));
    this.scroller.setExtent(new Point(innerW, innerH));
    this.codeBody.maxWidth = Math.max(
        60,
        innerW - MorphicPreferences.scrollBarSize - 16
    );
    this.codeBody.setPosition(
        this.scroller.position().add(new Point(this.scroller.padding, this.scroller.padding))
    );
    this.codeBody.fixLayout();
    this.codeBody.rerender();
    this.scroller.contents.adjustBounds();
    this.scroller.adjustScrollBars();
};

CodePaneMorph.prototype.setExtent = function (point) {
    // Keep a usable minimum width so the pane never looks "squished"
    var w = Math.max(300, point.x),
        h = Math.max(120, point.y);
    CodePaneMorph.uber.setExtent.call(this, new Point(w, h));
    this.fixLayout();
    if (this.ide) {
        this.ide.codePaneWidth = this.width();
    }
};

