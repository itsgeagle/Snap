/*

    codify.js

    Live multi-language code view for Snap!

    Converts scripts into Python / JavaScript / Java / Lua as you build.
    Handles Snap↔text differences that matter for real programs:

      • identifier sanitization (Snap allows spaces in names)
      • indexing (Snap is 1-based; Python/JS/Java are 0-based; Lua is 1-based)
      • custom block definitions emitted as functions
      • nested reporters composed into calls (pass values through)

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
InputSlotMorph, TemplateSlotMorph, SpriteMorph, contains, isNil*/

/*jshint esversion: 11*/

// Global stuff ////////////////////////////////////////////////////////

modules.codify = '2026-October-09';

var SnapCodifier;
var CodePaneMorph;

// SnapCodifier ////////////////////////////////////////////////////////

SnapCodifier = {
    language: 'python',
    scope: 'sprite', // 'sprite' | 'all'
    _identCache: null,
    _customBackups: null,

    languages: {
        python: {
            label: 'Python',
            ext: 'py',
            mime: 'text/x-python',
            comment: '#',
            indexBase: 0, // Snap item 1 → [0]
            emptyBody: 'pass',
            boolTrue: 'True',
            boolFalse: 'False',
            nullLit: 'None',
            andOp: 'and',
            orOp: 'or',
            notOp: 'not ',
            empty: '# (no scripts yet — add blocks to see Python here)\n' +
                '# Custom blocks become def functions; names with spaces are sanitized.\n',
            reserved: [
                'False', 'None', 'True', 'and', 'as', 'assert', 'async',
                'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
                'else', 'except', 'finally', 'for', 'from', 'global', 'if',
                'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
                'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
                'list', 'dict', 'str', 'int', 'float', 'type', 'id', 'input',
                'print', 'range', 'len', 'map', 'filter', 'sum', 'min', 'max'
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
            empty: '// (no scripts yet — add blocks to see JavaScript here)\n' +
                '// Custom blocks become functions; names with spaces are sanitized.\n',
            reserved: [
                'break', 'case', 'catch', 'class', 'const', 'continue',
                'debugger', 'default', 'delete', 'do', 'else', 'export',
                'extends', 'finally', 'for', 'function', 'if', 'import',
                'in', 'instanceof', 'let', 'new', 'return', 'super',
                'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
                'while', 'with', 'yield', 'enum', 'await', 'null', 'true',
                'false', 'undefined'
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
            empty: '// (no scripts yet — add blocks to see Java here)\n' +
                '// Custom blocks become methods; names with spaces are sanitized.\n',
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
                'true', 'false', 'null'
            ]
        },
        lua: {
            label: 'Lua',
            ext: 'lua',
            mime: 'text/x-lua',
            comment: '--',
            indexBase: 1, // same as Snap
            emptyBody: '-- empty',
            boolTrue: 'true',
            boolFalse: 'false',
            nullLit: 'nil',
            andOp: 'and',
            orOp: 'or',
            notOp: 'not ',
            empty: '-- (no scripts yet — add blocks to see Lua here)\n' +
                '-- Custom blocks become functions; names with spaces are sanitized.\n',
            reserved: [
                'and', 'break', 'do', 'else', 'elseif', 'end', 'false',
                'for', 'function', 'goto', 'if', 'in', 'local', 'nil',
                'not', 'or', 'repeat', 'return', 'then', 'true', 'until',
                'while'
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

    // Stable per original name; disambiguate distinct Snap names that collide
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
    // "foo %n bar %'my list'" → foo_bar
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
    // Prefer declaration keys when present (may include spaces)
    if (definition.declarations && definition.declarations.size) {
        names = Array.from(definition.declarations.keys());
    }
    return names.map(n => this.ident(n));
};

// ---- indexing helpers (Snap is always 1-based) ----------------------

SnapCodifier.indexAccess = function (collection, indexExpr) {
    // Read item / letter at Snap index
    if (this.profile().indexBase === 0) {
        return '(' + collection + ')[(' + indexExpr + ') - 1]';
    }
    return '(' + collection + ')[' + indexExpr + ']';
};

SnapCodifier.indexAssign = function (collection, indexExpr, valueExpr) {
    if (this.profile().indexBase === 0) {
        return '(' + collection + ')[(' + indexExpr + ') - 1] = ' + valueExpr;
    }
    return '(' + collection + ')[' + indexExpr + '] = ' + valueExpr;
};

SnapCodifier.indexDelete = function (collection, indexExpr) {
    var lang = this.language,
        idx = this.profile().indexBase === 0 ?
            '((' + indexExpr + ') - 1)' : '(' + indexExpr + ')';
    if (lang === 'python') {
        return 'del (' + collection + ')[' + idx + ']';
    }
    if (lang === 'javascript') {
        return '(' + collection + ').splice(' + idx + ', 1);';
    }
    if (lang === 'java') {
        return '(' + collection + ').remove(' + idx + ');';
    }
    // lua table.remove is 1-based
    return 'table.remove(' + collection + ', ' + indexExpr + ')';
};

SnapCodifier.indexInsert = function (collection, indexExpr, valueExpr) {
    var lang = this.language,
        idx = this.profile().indexBase === 0 ?
            '((' + indexExpr + ') - 1)' : '(' + indexExpr + ')';
    if (lang === 'python') {
        return '(' + collection + ').insert(' + idx + ', ' + valueExpr + ')';
    }
    if (lang === 'javascript') {
        return '(' + collection + ').splice(' + idx + ', 0, ' + valueExpr + ');';
    }
    if (lang === 'java') {
        return '(' + collection + ').add(' + idx + ', ' + valueExpr + ');';
    }
    return 'table.insert(' + collection + ', ' + indexExpr + ', ' + valueExpr + ')';
};

SnapCodifier.listIndexOf = function (itemExpr, listExpr) {
    // Snap "index of x in list" is 1-based; 0 if missing
    var lang = this.language;
    if (lang === 'python') {
        return '((' + listExpr + ').index(' + itemExpr + ') + 1 if (' +
            itemExpr + ') in (' + listExpr + ') else 0)';
    }
    if (lang === 'javascript') {
        return '((' + listExpr + ').indexOf(' + itemExpr + ') + 1)';
    }
    if (lang === 'java') {
        return '((' + listExpr + ').indexOf(' + itemExpr + ') + 1)';
    }
    // Lua: search returning 1-based index
    return '(function(l,v) for i,x in ipairs(l) do if x==v then return i end end; return 0 end)(' +
        listExpr + ', ' + itemExpr + ')';
};

SnapCodifier.rangeExpr = function (startExpr, endExpr) {
    var lang = this.language;
    if (lang === 'python') {
        return 'list(range(' + startExpr + ', (' + endExpr + ') + 1))';
    }
    if (lang === 'javascript') {
        return 'Array.from({length: (' + endExpr + ')-(' + startExpr +
            ')+1}, (_,i) => (' + startExpr + ')+i)';
    }
    if (lang === 'java') {
        return 'IntStream.rangeClosed(' + startExpr + ', ' + endExpr +
            ').boxed().collect(Collectors.toList())';
    }
    return '(function(a,b) local t={} for i=a,b do t[#t+1]=i end return t end)(' +
        startExpr + ', ' + endExpr + ')';
};

// ---- language templates (built per generation) ----------------------

SnapCodifier.buildMappings = function () {
    var p = this.profile(),
        lang = this.language,
        T = {},
        semi = (lang === 'javascript' || lang === 'java') ? ';' : '',
        forever, repeat, until, forLoop, forEach, ifThen, ifElse;

    T.string = lang === 'javascript' ? "'<#1>'" : '"<#1>"';
    T.number = '<#1>';
    T.boolTrue = p.boolTrue;
    T.boolFalse = p.boolFalse;
    T.reify = '<#1>';
    T.delim = ', ';
    T.item = '<#1>';
    T.list = lang === 'lua' ? '{<#1>}' :
        (lang === 'java' ? 'new ArrayList<>(List.of(<#1>))' : '[<#1>]');
    T.parms_delim = ', ';
    T.parms_item = '<#1>';
    T.parms_list = '<#1>';
    T.tempvars_delim = ', ';
    T.tempvars_item = '<#1>';
    T.tempvars_list = '<#1>';

    // Events
    T.receiveGo = p.comment + ' when green flag clicked';
    T.receiveKey = p.comment + ' when <#1> key pressed';
    T.receiveInteraction = p.comment + ' when I am <#1>';
    T.receiveMessage = p.comment + ' when I receive "<#1>"';
    T.receiveCondition = p.comment + ' when <#1>';
    T.receiveConditionEvent = p.comment + ' when <#1>';
    T.receiveOnClone = p.comment + ' when I start as a clone';
    T.receiveUserEdit = p.comment + ' when <#1> is edited';
    T.receiveSlotEvent = p.comment + ' when slot <#1> signals <#2>';

    // Motion
    T.forward = 'move(<#1>)' + semi;
    T.turn = 'turn_right(<#1>)' + semi;
    T.turnLeft = 'turn_left(<#1>)' + semi;
    T.setHeading = 'point_in_direction(<#1>)' + semi;
    T.doFaceTowards = 'point_towards(<#1>)' + semi;
    T.gotoXY = 'go_to(<#1>, <#2>)' + semi;
    T.doGotoObject = 'go_to(<#1>)' + semi;
    T.doGlide = 'glide(<#1>, <#2>, <#3>)' + semi;
    T.changeXPosition = 'change_x(<#1>)' + semi;
    T.setXPosition = 'set_x(<#1>)' + semi;
    T.changeYPosition = 'change_y(<#1>)' + semi;
    T.setYPosition = 'set_y(<#1>)' + semi;
    T.bounceOffEdge = 'if_on_edge_bounce()' + semi;
    T.getPosition = 'position()';
    T.xPosition = 'x_position()';
    T.yPosition = 'y_position()';
    T.direction = 'direction()';

    // Looks
    T.doSayFor = 'say(<#1>, <#2>)' + semi;
    T.bubble = 'say(<#1>)' + semi;
    T.doThinkFor = 'think(<#1>, <#2>)' + semi;
    T.doThink = 'think(<#1>)' + semi;
    T.doSwitchToCostume = 'switch_costume(<#1>)' + semi;
    T.doWearNextCostume = 'next_costume()' + semi;
    T.getCostumeIdx = 'costume_number()';
    T.changeEffect = 'change_effect(<#1>, <#2>)' + semi;
    T.setEffect = 'set_effect(<#1>, <#2>)' + semi;
    T.getEffect = 'effect(<#1>)';
    T.clearEffects = 'clear_graphic_effects()' + semi;
    T.changeScale = 'change_size(<#1>)' + semi;
    T.setScale = 'set_size(<#1>)' + semi;
    T.getScale = 'size()';
    T.show = 'show()' + semi;
    T.hide = 'hide()' + semi;
    T.reportShown = 'is_shown()';
    T.goToLayer = 'go_to_layer(<#1>)' + semi;
    T.goBack = 'go_back_layers(<#1>)' + semi;
    T.alert = 'alert(<#1>)' + semi;
    T.log = (lang === 'python' ? 'print(<#1>)' :
        (lang === 'lua' ? 'print(<#1>)' : 'console.log(<#1>)' + semi));

    // Sound
    T.playSound = 'play_sound(<#1>)' + semi;
    T.doPlaySoundUntilDone = 'play_sound_until_done(<#1>)' + semi;
    T.doPlaySoundAtRate = 'play_sound_at(<#1>, <#2>)' + semi;
    T.doStopAllSounds = 'stop_all_sounds()' + semi;
    T.doRest = 'rest(<#1>)' + semi;
    T.doPlayNote = 'play_note(<#1>, <#2>)' + semi;
    T.doPlayFrequency = 'play_frequency(<#1>, <#2>)' + semi;
    T.doSetInstrument = 'set_instrument(<#1>)' + semi;
    T.doChangeTempo = 'change_tempo(<#1>)' + semi;
    T.doSetTempo = 'set_tempo(<#1>)' + semi;
    T.getTempo = 'tempo()';
    T.changeVolume = 'change_volume(<#1>)' + semi;
    T.setVolume = 'set_volume(<#1>)' + semi;
    T.getVolume = 'volume()';
    T.changePan = 'change_balance(<#1>)' + semi;
    T.setPan = 'set_balance(<#1>)' + semi;
    T.getPan = 'balance()';
    T.playFreq = 'play_frequency(<#1>)' + semi;
    T.stopFreq = 'stop_frequency()' + semi;

    // Pen
    T.clear = 'clear()' + semi;
    T.down = 'pen_down()' + semi;
    T.up = 'pen_up()' + semi;
    T.getPenDown = 'is_pen_down()';
    T.setColor = 'set_pen_color(<#1>)' + semi;
    T.setPenColorDimension = 'set_pen_<#1>(<#2>)' + semi;
    T.changePenColorDimension = 'change_pen_<#1>(<#2>)' + semi;
    T.getPenAttribute = 'pen_<#1>()';
    T.changeSize = 'change_pen_size(<#1>)' + semi;
    T.setSize = 'set_pen_size(<#1>)' + semi;
    T.doStamp = 'stamp()' + semi;
    T.floodFill = 'fill()' + semi;
    T.write = 'write_pen(<#1>, <#2>)' + semi;
    T.doPasteOn = 'paste_on(<#1>)' + semi;
    T.doCutFrom = 'cut_from(<#1>)' + semi;

    // Control structures — language specific
    if (lang === 'python') {
        forever = 'while True:\n    <#1>';
        repeat = 'for _ in range(int(<#1>)):\n    <#2>';
        until = 'while not (<#1>):\n    <#2>';
        forLoop = 'for <#1> in range(int(<#2>), int(<#3>) + 1):\n    <#4>';
        forEach = 'for <#1> in <#2>:\n    <#3>';
        ifThen = 'if <#1>:\n    <#2>';
        ifElse = 'if <#1>:\n    <#2>\nelse:\n    <#3>';
        T.reportIfElse = '(<#2> if <#1> else <#3>)';
        T.doReport = 'return <#1>';
        T.doStopThis = 'return';
        T.doStopAll = 'stop_all()';
        T.doWait = 'wait(<#1>)';
        T.doWaitUntil = 'wait_until(lambda: <#1>)';
        T.doBroadcast = 'broadcast("<#1>")';
        T.doBroadcastAndWait = 'broadcast_and_wait("<#1>")';
        T.doDeclareVariables = '<#1> = None';
        T.doSetVar = '<#1> = <#2>';
        T.doChangeVar = '<#1> = (<#1>) + (<#2>)';
        T.doShowVar = 'show_variable("<#1>")';
        T.doHideVar = 'hide_variable("<#1>")';
        T.doRun = '<#1>(<#2>)';
        T.fork = 'async_launch(<#1>, <#2>)';
        T.evaluate = '<#1>(<#2>)';
        T.doWarp = '<#1>';
        T.createClone = 'create_clone(<#1>)';
        T.removeClone = 'delete_this_clone()';
        T.doPauseAll = 'pause_all()';
        T.doAsk = 'ask(<#1>)';
    } else if (lang === 'javascript') {
        forever = 'while (true) {\n    <#1>\n}';
        repeat = 'for (let _i = 0; _i < <#1>; _i++) {\n    <#2>\n}';
        until = 'while (!(<#1>)) {\n    <#2>\n}';
        forLoop = 'for (let <#1> = <#2>; <#1> <= <#3>; <#1>++) {\n    <#4>\n}';
        forEach = 'for (const <#1> of <#2>) {\n    <#3>\n}';
        ifThen = 'if (<#1>) {\n    <#2>\n}';
        ifElse = 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}';
        T.reportIfElse = '(<#1> ? <#2> : <#3>)';
        T.doReport = 'return <#1>;';
        T.doStopThis = 'return;';
        T.doStopAll = 'stopAll();';
        T.doWait = 'await wait(<#1>);';
        T.doWaitUntil = 'await waitUntil(() => <#1>);';
        T.doBroadcast = 'broadcast("<#1>");';
        T.doBroadcastAndWait = 'await broadcastAndWait("<#1>");';
        T.doDeclareVariables = 'let <#1>;';
        T.doSetVar = '<#1> = <#2>;';
        T.doChangeVar = '<#1> += <#2>;';
        T.doShowVar = 'showVariable("<#1>");';
        T.doHideVar = 'hideVariable("<#1>");';
        T.doRun = '<#1>(<#2>);';
        T.fork = 'queueMicrotask(() => <#1>(<#2>));';
        T.evaluate = '<#1>(<#2>)';
        T.doWarp = '<#1>';
        T.createClone = 'createClone(<#1>);';
        T.removeClone = 'deleteThisClone();';
        T.doPauseAll = 'pauseAll();';
        T.doAsk = 'await ask(<#1>);';
    } else if (lang === 'java') {
        forever = 'while (true) {\n    <#1>\n}';
        repeat = 'for (int _i = 0; _i < <#1>; _i++) {\n    <#2>\n}';
        until = 'while (!(<#1>)) {\n    <#2>\n}';
        forLoop = 'for (int <#1> = <#2>; <#1> <= <#3>; <#1>++) {\n    <#4>\n}';
        forEach = 'for (Object <#1> : <#2>) {\n    <#3>\n}';
        ifThen = 'if (<#1>) {\n    <#2>\n}';
        ifElse = 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}';
        T.reportIfElse = '(<#1> ? <#2> : <#3>)';
        T.doReport = 'return <#1>;';
        T.doStopThis = 'return;';
        T.doStopAll = 'stopAll();';
        T.doWait = 'waitSecs(<#1>);';
        T.doWaitUntil = 'waitUntil(<#1>);';
        T.doBroadcast = 'broadcast("<#1>");';
        T.doBroadcastAndWait = 'broadcastAndWait("<#1>");';
        T.doDeclareVariables = 'Object <#1> = null;';
        T.doSetVar = '<#1> = <#2>;';
        T.doChangeVar = '<#1> = ((Number)<#1>).doubleValue() + ((Number)(<#2>)).doubleValue();';
        T.doShowVar = 'showVariable("<#1>");';
        T.doHideVar = 'hideVariable("<#1>");';
        T.doRun = '<#1>.run(<#2>);';
        T.fork = 'launch(<#1>, <#2>);';
        T.evaluate = '<#1>.call(<#2>)';
        T.doWarp = '<#1>';
        T.createClone = 'createClone(<#1>);';
        T.removeClone = 'deleteThisClone();';
        T.doPauseAll = 'pauseAll();';
        T.doAsk = 'ask(<#1>);';
    } else { // lua
        forever = 'while true do\n    <#1>\nend';
        repeat = 'for _ = 1, <#1> do\n    <#2>\nend';
        until = 'while not (<#1>) do\n    <#2>\nend';
        forLoop = 'for <#1> = <#2>, <#3> do\n    <#4>\nend';
        forEach = 'for _, <#1> in ipairs(<#2>) do\n    <#3>\nend';
        ifThen = 'if <#1> then\n    <#2>\nend';
        ifElse = 'if <#1> then\n    <#2>\nelse\n    <#3>\nend';
        T.reportIfElse = '(<#1> and <#2> or <#3>)';
        T.doReport = 'return <#1>';
        T.doStopThis = 'return';
        T.doStopAll = 'stop_all()';
        T.doWait = 'wait(<#1>)';
        T.doWaitUntil = 'wait_until(function() return <#1> end)';
        T.doBroadcast = 'broadcast("<#1>")';
        T.doBroadcastAndWait = 'broadcast_and_wait("<#1>")';
        T.doDeclareVariables = 'local <#1>';
        T.doSetVar = '<#1> = <#2>';
        T.doChangeVar = '<#1> = <#1> + <#2>';
        T.doShowVar = 'show_variable("<#1>")';
        T.doHideVar = 'hide_variable("<#1>")';
        T.doRun = '<#1>(<#2>)';
        T.fork = 'launch(<#1>, <#2>)';
        T.evaluate = '<#1>(<#2>)';
        T.doWarp = '<#1>';
        T.createClone = 'create_clone(<#1>)';
        T.removeClone = 'delete_this_clone()';
        T.doPauseAll = 'pause_all()';
        T.doAsk = 'ask(<#1>)';
    }

    T.doForever = forever;
    T.doRepeat = repeat;
    T.doUntil = until;
    T.doFor = forLoop;
    T.doForEach = forEach;
    T.doIf = ifThen;
    T.doIfElse = ifElse;

    // Sensing
    T.reportTouchingObject = 'touching(<#1>)';
    T.reportTouchingColor = 'touching_color(<#1>)';
    T.reportColorIsTouchingColor = 'color_is_touching(<#1>, <#2>)';
    T.reportLastAnswer = 'answer()';
    T.getLastAnswer = 'answer()';
    T.reportMousePosition = 'mouse_position()';
    T.reportMouseX = 'mouse_x()';
    T.reportMouseY = 'mouse_y()';
    T.reportMouseDown = 'mouse_down()';
    T.reportKeyPressed = 'key_pressed(<#1>)';
    T.doResetTimer = 'reset_timer()' + semi;
    T.reportTimer = 'timer()';
    T.getTimer = 'timer()';
    T.reportAttributeOf = 'attribute(<#1>, <#2>)';
    T.reportObject = 'object(<#1>)';
    T.reportURL = 'http_get(<#1>)';
    T.reportDate = 'current(<#1>)';
    T.reportGet = 'my(<#1>)';
    T.reportAspect = 'aspect(<#1>, <#2>)';
    T.reportRelationTo = 'relation(<#1>, <#2>)';
    T.reportAudio = 'microphone(<#1>)';
    T.reportVideo = 'video(<#1>, <#2>)';

    // Operators
    T.reportSum = '(<#1> + <#2>)';
    T.reportDifference = '(<#1> - <#2>)';
    T.reportProduct = '(<#1> * <#2>)';
    T.reportQuotient = '(<#1> / <#2>)';
    T.reportModulus = '(<#1> % <#2>)';
    T.reportPower = lang === 'python' ? '(<#1> ** <#2>)' :
        (lang === 'lua' ? '(<#1> ^ <#2>)' : 'Math.pow(<#1>, <#2>)');
    T.reportRound = lang === 'python' ? 'round(<#1>)' :
        (lang === 'lua' ? 'math.floor(<#1>+0.5)' : 'Math.round(<#1>)');
    T.reportMonadic = lang === 'python' ? '<#1>(<#2>)' :
        (lang === 'lua' ? 'math.<#1>(<#2>)' : 'Math.<#1>(<#2>)');
    T.reportAtan2 = lang === 'python' ? 'math.atan2(<#1>, <#2>)' :
        (lang === 'lua' ? 'math.atan2(<#1>, <#2>)' : 'Math.atan2(<#1>, <#2>)');
    T.reportRandom = lang === 'python' ? 'random.randint(int(<#1>), int(<#2>))' :
        (lang === 'lua' ? 'math.random(<#1>, <#2>)' :
            '(<#1> + Math.floor(Math.random()*((<#2>)-(<#1>)+1)))');
    T.reportLessThan = '(<#1> < <#2>)';
    T.reportEquals = lang === 'javascript' ? '(<#1> === <#2>)' : '(<#1> == <#2>)';
    T.reportGreaterThan = '(<#1> > <#2>)';
    T.reportLessThanOrEquals = '(<#1> <= <#2>)';
    T.reportGreaterThanOrEquals = '(<#1> >= <#2>)';
    T.reportNotEquals = lang === 'javascript' ? '(<#1> !== <#2>)' : '(<#1> != <#2>)';
    T.reportAnd = '(<#1> ' + p.andOp + ' <#2>)';
    T.reportOr = '(<#1> ' + p.orOp + ' <#2>)';
    T.reportNot = '(' + p.notOp + '<#1>)';
    T.reportBoolean = '<#1>';
    T.reportTrue = p.boolTrue;
    T.reportFalse = p.boolFalse;
    T.reportJoinWords = lang === 'python' ? '"".join([str(x) for x in [<#1>]])' :
        (lang === 'javascript' ? '[<#1>].join("")' :
            (lang === 'java' ? 'String.valueOf(<#1>)' : 'table.concat({<#1>})'));
    T.reportStringSize = lang === 'python' ? 'len(str(<#1>))' :
        (lang === 'javascript' ? 'String(<#1>).length' :
            (lang === 'java' ? 'String.valueOf(<#1>).length()' : '#tostring(<#1>)'));
    T.reportTextAttribute = lang === 'python' ? 'len(str(<#2>))' :
        (lang === 'javascript' ? 'String(<#2>).length' :
            (lang === 'java' ? 'String.valueOf(<#2>).length()' : '#tostring(<#2>)'));
    T.reportUnicode = lang === 'python' ? 'ord(str(<#1>)[0])' :
        (lang === 'javascript' ? 'String(<#1>).charCodeAt(0)' :
            (lang === 'java' ? '(int)String.valueOf(<#1>).charAt(0)' :
                'string.byte(tostring(<#1>), 1)'));
    T.reportUnicodeAsLetter = lang === 'python' ? 'chr(int(<#1>))' :
        (lang === 'javascript' ? 'String.fromCharCode(<#1>)' :
            (lang === 'java' ? 'String.valueOf((char)(int)(<#1>))' :
                'string.char(<#1>)'));
    T.reportIsA = lang === 'python' ? 'isinstance(<#1>, <#2>)' :
        (lang === 'javascript' ? '(typeof <#1> === String(<#2>).toLowerCase())' :
            (lang === 'java' ? '(<#1> instanceof Object /* <#2> */)' :
                '(type(<#1>) == "<#2>")'));
    T.reportIsIdentical = lang === 'python' ? '(<#1> is <#2>)' :
        (lang === 'javascript' ? '(<#1> === <#2>)' : '(<#1> == <#2>)');
    T.reportVariadicIsIdentical = T.reportIsIdentical;
    T.reportTextSplit = lang === 'python' ? 'str(<#1>).split(<#2>)' :
        (lang === 'javascript' ? 'String(<#1>).split(<#2>)' :
            (lang === 'java' ? 'String.valueOf(<#1>).split(<#2>)' :
                'split_string(<#1>, <#2>)'));
    T.reportTypeOf = lang === 'python' ? 'type(<#1>).__name__' :
        (lang === 'javascript' ? 'typeof <#1>' : 'type(<#1>)');
    T.reportVariadicSum = '(<#1>)';
    T.reportVariadicProduct = '(<#1>)';
    T.reportVariadicMin = lang === 'python' ? 'min(<#1>)' :
        (lang === 'javascript' ? 'Math.min(<#1>)' :
            (lang === 'java' ? 'Collections.min(List.of(<#1>))' : 'math.min(<#1>)'));
    T.reportVariadicMax = lang === 'python' ? 'max(<#1>)' :
        (lang === 'javascript' ? 'Math.max(<#1>)' :
            (lang === 'java' ? 'Collections.max(List.of(<#1>))' : 'math.max(<#1>)'));
    T.reportVariadicLessThan = '(<#1>)';
    T.reportVariadicEquals = '(<#1>)';
    T.reportVariadicGreaterThan = '(<#1>)';
    T.reportVariadicAnd = '(<#1>)';
    T.reportVariadicOr = '(<#1>)';

    // Lists — index-aware where needed (special emitters also used)
    T.reportNewList = T.list;
    T.reportCONS = lang === 'python' ? '[<#1>] + list(<#2>)' :
        (lang === 'javascript' ? '[<#1>, ...<#2>]' :
            (lang === 'java' ? 'cons(<#1>, <#2>)' :
                '(function(a,t) local u={a} for i=1,#t do u[i+1]=t[i] end return u end)(<#1>,<#2>)'));
    T.reportCDR = lang === 'python' ? 'list(<#1>)[1:]' :
        (lang === 'javascript' ? '(<#1>).slice(1)' :
            (lang === 'java' ? '(<#1>).subList(1, (<#1>).size())' :
                '(function(t) local u={} for i=2,#t do u[#u+1]=t[i] end return u end)(<#1>)'));
    T.reportListLength = lang === 'python' ? 'len(<#1>)' :
        (lang === 'javascript' ? '(<#1>).length' :
            (lang === 'java' ? '(<#1>).size()' : '#(<#1>)'));
    T.reportListAttribute = T.reportListLength;
    T.reportListContainsItem = lang === 'python' ? '((<#2>) in (<#1>))' :
        (lang === 'javascript' ? '(<#1>).includes(<#2>)' :
            (lang === 'java' ? '(<#1>).contains(<#2>)' :
                'table_contains(<#1>, <#2>)'));
    T.reportListIsEmpty = lang === 'python' ? '(len(<#1>) == 0)' :
        (lang === 'javascript' ? '((<#1>).length === 0)' :
            (lang === 'java' ? '(<#1>).isEmpty()' : '(#(<#1>) == 0)'));
    T.doAddToList = lang === 'python' ? '(<#2>).append(<#1>)' :
        (lang === 'javascript' ? '(<#2>).push(<#1>);' :
            (lang === 'java' ? '(<#2>).add(<#1>);' :
                'table.insert(<#2>, <#1>)'));
    T.reportConcatenatedLists = lang === 'python' ? '(<#1>)' :
        (lang === 'javascript' ? '[].concat(<#1>)' :
            (lang === 'java' ? 'concatLists(<#1>)' : 'concat_lists(<#1>)'));
    T.reportMap = lang === 'python' ? '[<#1>(x) for x in <#2>]' :
        (lang === 'javascript' ? '(<#2>).map(<#1>)' :
            (lang === 'java' ? 'mapList(<#1>, <#2>)' : 'map_list(<#1>, <#2>)'));
    T.reportKeep = lang === 'python' ? '[x for x in <#2> if <#1>(x)]' :
        (lang === 'javascript' ? '(<#2>).filter(<#1>)' :
            (lang === 'java' ? 'keepList(<#1>, <#2>)' : 'keep_list(<#1>, <#2>)'));
    T.reportFindFirst = lang === 'python' ? 'next((x for x in <#2> if <#1>(x)), None)' :
        (lang === 'javascript' ? '(<#2>).find(<#1>)' :
            (lang === 'java' ? 'findFirst(<#1>, <#2>)' : 'find_first(<#1>, <#2>)'));
    T.reportCombine = lang === 'python' ? 'functools.reduce(<#2>, <#1>)' :
        (lang === 'javascript' ? '(<#1>).reduce(<#2>)' :
            (lang === 'java' ? 'combineList(<#1>, <#2>)' : 'combine_list(<#1>, <#2>)'));
    T.reportAtomicMap = T.reportMap;
    T.reportAtomicKeep = T.reportKeep;
    T.reportAtomicFindFirst = T.reportFindFirst;
    T.reportAtomicCombine = T.reportCombine;

    // Index-aware list/text ops: Snap is always 1-based.
    // Python/JS/Java → subtract 1; Lua stays 1-based like Snap.
    if (lang === 'python') {
        T.reportListItem = '(<#2>)[(<#1>) - 1]';
        T.reportLetter = 'str(<#2>)[(<#1>) - 1]';
        T.doDeleteFromList = 'del (<#2>)[(<#1>) - 1]';
        T.doInsertInList = '(<#3>).insert((<#2>) - 1, <#1>)';
        T.doReplaceInList = '(<#3>)[(<#2>) - 1] = <#1>';
        T.reportListIndex = '((<#2>).index(<#1>) + 1 if (<#1>) in (<#2>) else 0)';
        T.reportNumbers = 'list(range(int(<#1>), int(<#2>) + 1))';
    } else if (lang === 'javascript') {
        T.reportListItem = '(<#2>)[(<#1>) - 1]';
        T.reportLetter = 'String(<#2>).charAt((<#1>) - 1)';
        T.doDeleteFromList = '(<#2>).splice((<#1>) - 1, 1);';
        T.doInsertInList = '(<#3>).splice((<#2>) - 1, 0, <#1>);';
        T.doReplaceInList = '(<#3>)[(<#2>) - 1] = <#1>;';
        T.reportListIndex = '((<#2>).indexOf(<#1>) + 1)';
        T.reportNumbers = 'Array.from({length: (<#2>)-(<#1>)+1}, (_,i)=>(<#1>)+i)';
    } else if (lang === 'java') {
        T.reportListItem = '(<#2>).get((<#1>) - 1)';
        T.reportLetter = 'String.valueOf(<#2>).charAt((<#1>) - 1)';
        T.doDeleteFromList = '(<#2>).remove((<#1>) - 1);';
        T.doInsertInList = '(<#3>).add((<#2>) - 1, <#1>);';
        T.doReplaceInList = '(<#3>).set((<#2>) - 1, <#1>);';
        T.reportListIndex = '((<#2>).indexOf(<#1>) + 1)';
        T.reportNumbers = 'rangeList(<#1>, <#2>)';
    } else { // lua — 1-based like Snap
        T.reportListItem = '(<#2>)[<#1>]';
        T.reportLetter = 'string.sub(tostring(<#2>), <#1>, <#1>)';
        T.doDeleteFromList = 'table.remove(<#2>, <#1>)';
        T.doInsertInList = 'table.insert(<#3>, <#2>, <#1>)';
        T.doReplaceInList = '(<#3>)[<#2>] = <#1>';
        T.reportListIndex = '(function(l,v) for i,x in ipairs(l) do if x==v then return i end end return 0 end)(<#2>,<#1>)';
        T.reportNumbers = '(function(a,b) local t={} for i=a,b do t[#t+1]=i end return t end)(<#1>,<#2>)';
    }

    // Rings / higher-order
    T.reifyScript = lang === 'python' ? '(lambda: (<#1>))' :
        (lang === 'javascript' ? '(() => { <#1> })' :
            (lang === 'java' ? '(() -> { <#1> })' : 'function() <#1> end'));
    T.reifyReporter = lang === 'python' ? '(lambda: <#1>)' :
        (lang === 'javascript' ? '(() => <#1>)' :
            (lang === 'java' ? '(() -> <#1>)' : 'function() return <#1> end'));
    T.reifyPredicate = T.reifyReporter;

    // Misc / metaprogramming stubs
    T.doDefineBlock = p.comment + ' define block <#1>';
    T.doDeleteBlock = p.comment + ' delete block <#1>';
    T.doSetBlockAttribute = p.comment + ' set block attribute';
    T.reportBlockAttribute = 'block_attribute(<#1>, <#2>)';
    T.reportEnvironment = 'this_environment(<#1>)';
    T.reportPipe = 'pipe(<#1>, <#2>)';
    T.doTellTo = 'tell(<#1>, <#2>)' + semi;
    T.reportAskFor = 'ask_for(<#1>, <#2>, <#3>)';
    T.newClone = 'new_clone(<#1>)';
    T.doSwitchToScene = 'switch_scene(<#1>)' + semi;

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

// ---- custom blocks → functions --------------------------------------

SnapCodifier.functionSignature = function (definition) {
    var name = this.specToFunctionName(definition.spec),
        params = this.inputNamesOf(definition),
        lang = this.language,
        p = this.profile(),
        paramList = params.join(', '),
        empty = !definition.body || !definition.body.expression,
        bodyStub = empty ? p.emptyBody : '<body>',
        header,
        call,
        i,
        callArgs = [];

    for (i = 1; i <= Math.max(params.length, definition.declarations ?
            definition.declarations.size : 0); i += 1) {
        callArgs.push('<#' + i + '>');
    }
    // Fall back to inputNames length
    if (!callArgs.length && params.length) {
        callArgs = params.map((_, idx) => '<#' + (idx + 1) + '>');
    }
    // Always at least allow zero-arg call
    call = name + '(' + callArgs.join(', ') + ')';

    if (lang === 'python') {
        header = 'def ' + name + '(' + paramList + '):\n    ' + bodyStub;
        if (definition.type === 'reporter' || definition.type === 'predicate') {
            // callers use expression form
        } else {
            // command
        }
    } else if (lang === 'javascript') {
        header = 'function ' + name + '(' + paramList + ') {\n    ' +
            (empty ? bodyStub : bodyStub) + '\n}';
        // For non-empty, mappedCode replaces <body>
        header = 'function ' + name + '(' + paramList + ') {\n    <body>\n}';
        if (empty) {
            header = 'function ' + name + '(' + paramList + ') {\n    ' +
                p.emptyBody + '\n}';
        }
        if (!empty && (definition.type === 'command')) {
            call = call + ';';
        }
    } else if (lang === 'java') {
        header = 'public static Object ' + name + '(' +
            params.map(n => 'Object ' + n).join(', ') + ') {\n    <body>\n}';
        if (empty) {
            header = 'public static Object ' + name + '(' +
                params.map(n => 'Object ' + n).join(', ') + ') {\n    ' +
                p.emptyBody + '\n    return null;\n}';
        }
        if (!empty && definition.type === 'command') {
            call = call + ';';
        }
    } else { // lua
        header = 'function ' + name + '(' + paramList + ')\n    <body>\nend';
        if (empty) {
            header = 'function ' + name + '(' + paramList + ')\n    ' +
                p.emptyBody + '\nend';
        }
    }

    // Python empty / non-empty headers
    if (lang === 'python') {
        if (empty) {
            header = 'def ' + name + '(' + paramList + '):\n    ' + p.emptyBody;
        } else {
            header = 'def ' + name + '(' + paramList + '):\n    <body>';
        }
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
        var sig = this.functionSignature(def);
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

// ---- generation with patches for names ------------------------------

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
                !StageMorph.prototype.codeMappings[sel]) {
            StageMorph.prototype.codeMappings[sel] = this.blockFallback(cursor);
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
    this.ensureFallbacks(block);
    return block.mappedCode() || this.blockFallback(block);
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
    header = meta.comment + ' sprite: ' + (sprite.name || 'Sprite');
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
        origTemplateEval = TemplateSlotMorph.prototype.evaluate,
        result;

    this._identCache = {};
    this.applyLanguage(this.language);
    this.installCustomMappings(ide);

    // Sanitize variable reporters: Snap "my var" → my_var
    BlockMorph.prototype.mappedCode = function (definitions) {
        var code, next;
        if (this.selector === 'reportGetVar') {
            code = myself.ident(this.blockSpec);
            if (this.nextBlock && this.nextBlock()) {
                next = this.nextBlock().mappedCode(definitions);
                if (next) { code += '\n' + next; }
            }
            return code;
        }
        return origBlockMapped.call(this, definitions);
    };

    // Sanitize variable *slots* in set/change/show/hide
    InputSlotMorph.prototype.mappedCode = function () {
        var block = this.parentThatIsA(BlockMorph),
            val,
            mapped;
        if (block && contains(
                ['doSetVar', 'doChangeVar', 'doShowVar', 'doHideVar'],
                block.selector
            )) {
            // Only the variable-name slot (first input) is an identifier
            if (block.inputs()[0] === this) {
                val = this.evaluate();
                return myself.ident(val);
            }
        }
        mapped = origInputMapped.call(this);
        return mapped;
    };

    // Sanitize upvars in for / for each templates
    TemplateSlotMorph.prototype.evaluate = function () {
        return myself.ident(this.contents());
    };

    try {
        result = fn.call(this);
    } finally {
        BlockMorph.prototype.mappedCode = origBlockMapped;
        InputSlotMorph.prototype.mappedCode = origInputMapped;
        TemplateSlotMorph.prototype.evaluate = origTemplateEval;
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

SnapCodifier.prelude = function () {
    var p = this.profile(),
        lang = this.language,
        lines = [];

    lines.push(p.comment + ' Generated live from Snap!  →  ' + p.label);
    lines.push(p.comment + ' Output only — edit blocks on the left to change this.');
    lines.push(p.comment +
        ' Names: Snap allows spaces; identifiers are sanitized (e.g. "my var" → my_var).');
    if (p.indexBase === 0) {
        lines.push(p.comment +
            ' Indexing: Snap is 1-based; this output converts item/letter indexes to 0-based.');
    } else {
        lines.push(p.comment +
            ' Indexing: Snap and ' + p.label + ' are both 1-based (no conversion).');
    }
    lines.push(p.comment +
        ' Custom blocks become functions; nested reporters compose as arguments.');
    lines.push('');

    if (lang === 'python') {
        lines.push('import random');
        lines.push('import functools');
        lines.push('import math');
        lines.push('');
    } else if (lang === 'java') {
        lines.push('import java.util.*;');
        lines.push('import java.util.stream.*;');
        lines.push('');
        lines.push('public class SnapExport {');
        lines.push('    // helper stubs / scripts');
        lines.push('');
    } else if (lang === 'lua') {
        lines.push('local function table_contains(t, v)');
        lines.push('    for _, x in ipairs(t) do if x == v then return true end end');
        lines.push('    return false');
        lines.push('end');
        lines.push('');
    }
    return lines.join('\n');
};

SnapCodifier.epilogue = function () {
    if (this.language === 'java') {
        return '\n}\n';
    }
    return '';
};

SnapCodifier.generate = function (ide) {
    var meta = this.profile(),
        myself = this;

    if (!ide) {
        return meta.empty;
    }

    return this.withTranslationContext(ide, function () {
        var parts = [],
            text,
            stage,
            out;

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

        if (!parts.length) {
            return myself.prelude() + meta.empty;
        }
        out = myself.prelude() + parts.join('\n') + myself.epilogue();
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

CodePaneMorph.prototype.copyCode = function () {
    var text = this.cachedCode || '',
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
        blob,
        fileName = safe + '.' + meta.ext;
    try {
        blob = new Blob(
            [this.cachedCode || ''],
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
    ide.saveFileAs(this.cachedCode || '', 'text/plain;charset=utf-8', safe);
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
