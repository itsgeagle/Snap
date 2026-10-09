/*

    codify.js

    Live multi-language code view for Snap!
    Converts scripts on the current sprite (or all sprites) into
    Python / JavaScript / Java / Lua as you build.

    written by Cursor Agent for itsgeagle/Snap
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

/*global Morph, AlignmentMorph, PushButtonMorph,
ScrollFrameMorph, TextMorph, StringMorph, MenuMorph, Point,
Color, HandleMorph, StageMorph, BlockMorph, HatBlockMorph, localize,
MorphicPreferences, WHITE, SymbolMorph, modules, saveAs*/

/*jshint esversion: 11*/

// Global stuff ////////////////////////////////////////////////////////

modules.codify = '2026-October-09';

var SnapCodifier;
var CodePaneMorph;

// SnapCodifier ////////////////////////////////////////////////////////
//
// Built-in language templates + conversion helpers.
// Uses Snap's existing mappedCode() infrastructure.

SnapCodifier = {
    language: 'python',
    scope: 'sprite', // 'sprite' | 'all'
    languages: {
        python: {
            label: 'Python',
            ext: 'py',
            mime: 'text/x-python',
            comment: '#',
            empty: '# (no scripts yet — add blocks to see Python here)\n'
        },
        javascript: {
            label: 'JavaScript',
            ext: 'js',
            mime: 'text/javascript',
            comment: '//',
            empty: '// (no scripts yet — add blocks to see JavaScript here)\n'
        },
        java: {
            label: 'Java',
            ext: 'java',
            mime: 'text/x-java-source',
            comment: '//',
            empty: '// (no scripts yet — add blocks to see Java here)\n'
        },
        lua: {
            label: 'Lua',
            ext: 'lua',
            mime: 'text/x-lua',
            comment: '--',
            empty: '-- (no scripts yet — add blocks to see Lua here)\n'
        }
    }
};

SnapCodifier.templates = {

    python: {
        string: '"<#1>"',
        number: '<#1>',
        boolTrue: 'True',
        boolFalse: 'False',
        reify: '<#1>',
        delim: ', ',
        item: '<#1>',
        list: '[<#1>]',
        parms_delim: ', ',
        parms_item: '<#1>',
        parms_list: '<#1>',
        tempvars_delim: ', ',
        tempvars_item: '<#1>',
        tempvars_list: '<#1>',

        // Events
        receiveGo: '# when green flag clicked',
        receiveKey: '# when <#1> key pressed',
        receiveInteraction: '# when I am <#1>',
        receiveMessage: '# when I receive "<#1>"',
        receiveCondition: '# when <#1>',
        receiveOnClone: '# when I start as a clone',

        // Motion
        forward: 'move(<#1>)',
        turn: 'turn_right(<#1>)',
        turnLeft: 'turn_left(<#1>)',
        setHeading: 'point_in_direction(<#1>)',
        doFaceTowards: 'point_towards(<#1>)',
        gotoXY: 'go_to(x=<#1>, y=<#2>)',
        doGotoObject: 'go_to(<#1>)',
        doGlide: 'glide(<#1>, x=<#2>, y=<#3>)',
        changeXPosition: 'change_x(<#1>)',
        setXPosition: 'set_x(<#1>)',
        changeYPosition: 'change_y(<#1>)',
        setYPosition: 'set_y(<#1>)',
        bounceOffEdge: 'if_on_edge_bounce()',
        xPosition: 'x_position()',
        yPosition: 'y_position()',
        direction: 'direction()',
        getPosition: 'position()',

        // Looks
        doSayFor: 'say(<#1>, <#2>)',
        bubble: 'say(<#1>)',
        doThinkFor: 'think(<#1>, <#2>)',
        doThink: 'think(<#1>)',
        doSwitchToCostume: 'switch_costume(<#1>)',
        doWearNextCostume: 'next_costume()',
        changeEffect: 'change_effect("<#1>", <#2>)',
        setEffect: 'set_effect("<#1>", <#2>)',
        clearEffects: 'clear_graphic_effects()',
        changeScale: 'change_size(<#1>)',
        setScale: 'set_size(<#1>)',
        show: 'show()',
        hide: 'hide()',
        getScale: 'size()',

        // Sound
        playSound: 'play_sound(<#1>)',
        doPlaySoundUntilDone: 'play_sound_until_done(<#1>)',
        doStopAllSounds: 'stop_all_sounds()',
        doRest: 'rest(<#1>)',
        doPlayNote: 'play_note(<#1>, <#2>)',
        doChangeTempo: 'change_tempo(<#1>)',
        doSetTempo: 'set_tempo(<#1>)',
        getTempo: 'tempo()',

        // Pen
        clear: 'clear()',
        down: 'pen_down()',
        up: 'pen_up()',
        setColor: 'set_pen_color(<#1>)',
        changeSize: 'change_pen_size(<#1>)',
        setSize: 'set_pen_size(<#1>)',
        doStamp: 'stamp()',
        floodFill: 'fill()',

        // Control
        doWait: 'wait(<#1>)',
        doWaitUntil: 'wait_until(<#1>)',
        doForever: 'while True:\n    <#1>',
        doRepeat: 'for _ in range(<#1>):\n    <#2>',
        doUntil: 'while not (<#1>):\n    <#2>',
        doFor: 'for <#1> in range(<#2>, (<#3>) + 1):\n    <#4>',
        doIf: 'if <#1>:\n    <#2>',
        doIfElse: 'if <#1>:\n    <#2>\nelse:\n    <#3>',
        doReport: 'return <#1>',
        doStopThis: 'stop()',
        doStopAll: 'stop_all()',
        doRun: '<#1>(<#2>)',
        fork: 'async <#1>(<#2>)',
        evaluate: '<#1>(<#2>)',
        doBroadcast: 'broadcast("<#1>")',
        doBroadcastAndWait: 'broadcast_and_wait("<#1>")',
        createClone: 'create_clone(<#1>)',
        removeClone: 'delete_this_clone()',
        doPauseAll: 'pause_all()',

        // Sensing
        reportTouchingObject: 'touching(<#1>)',
        reportTouchingColor: 'touching_color(<#1>)',
        reportColorIsTouchingColor: 'color_is_touching(<#1>, <#2>)',
        doAsk: 'ask(<#1>)',
        reportLastAnswer: 'answer()',
        getLastAnswer: 'answer()',
        reportMouseX: 'mouse_x()',
        reportMouseY: 'mouse_y()',
        reportMouseDown: 'mouse_down()',
        reportKeyPressed: 'key_pressed(<#1>)',
        doResetTimer: 'reset_timer()',
        reportTimer: 'timer()',
        getTimer: 'timer()',
        reportDate: 'current("<#1>")',
        reportURL: 'http_get(<#1>)',

        // Operators
        reportSum: '(<#1> + <#2>)',
        reportDifference: '(<#1> - <#2>)',
        reportProduct: '(<#1> * <#2>)',
        reportQuotient: '(<#1> / <#2>)',
        reportModulus: '(<#1> % <#2>)',
        reportPower: '(<#1> ** <#2>)',
        reportRound: 'round(<#1>)',
        reportMonadic: '<#1>(<#2>)',
        reportRandom: 'random.randint(<#1>, <#2>)',
        reportLessThan: '(<#1> < <#2>)',
        reportEquals: '(<#1> == <#2>)',
        reportGreaterThan: '(<#1> > <#2>)',
        reportAnd: '(<#1> and <#2>)',
        reportOr: '(<#1> or <#2>)',
        reportNot: '(not <#1>)',
        reportBoolean: '<#1>',
        reportTrue: 'True',
        reportFalse: 'False',
        reportJoinWords: '"".join([<#1>])',
        reportTextAttribute: 'len(<#2>)' ,
        reportLetter: '(<#2>)[<#1> - 1]',
        reportUnicode: 'ord(<#1>)',
        reportUnicodeAsLetter: 'chr(<#1>)',
        reportIsA: 'isinstance(<#1>, <#2>)',
        reportIsIdentical: '(<#1> is <#2>)',
        reportTextSplit: '(<#1>).split(<#2>)',
        reportVariadicSum: '(<#1>)',
        reportVariadicProduct: '(<#1>)',
        reportVariadicMin: 'min(<#1>)',
        reportVariadicMax: 'max(<#1>)',
        reportVariadicLessThan: '(<#1>)',
        reportVariadicEquals: '(<#1>)',
        reportVariadicGreaterThan: '(<#1>)',
        reportVariadicAnd: '(<#1>)',
        reportVariadicOr: '(<#1>)',

        // Variables
        doSetVar: '<#1> = <#2>',
        doChangeVar: '<#1> += <#2>',
        doShowVar: 'show_variable("<#1>")',
        doHideVar: 'hide_variable("<#1>")',
        doDeclareVariables: '<#1> = None',

        // Lists
        reportNewList: '[<#1>]',
        reportCONS: '[<#1>] + list(<#2>)',
        reportListItem: '(<#2>)[<#1> - 1]',
        reportCDR: '(<#1>)[1:]',
        reportListAttribute: 'len(<#1>)',
        reportListContainsItem: '(<#2> in <#1>)',
        reportListIsEmpty: '(len(<#1>) == 0)',
        reportListIndex: '((<#2>).index(<#1>) + 1 if <#1> in <#2> else 0)',
        doAddToList: '(<#2>).append(<#1>)',
        doDeleteFromList: '(<#2>).pop(<#1> - 1)',
        doInsertInList: '(<#3>).insert(<#2> - 1, <#1>)',
        doReplaceInList: '(<#3>)[<#2> - 1] = <#1>',
        reportNumbers: 'list(range(<#1>, (<#2>) + 1))',
        reportConcatenatedLists: '(<#1>)',
        reportMap: '[<#1>(x) for x in <#2>]',
        reportKeep: '[x for x in <#2> if <#1>(x)]',
        reportFindFirst: 'next((x for x in <#2> if <#1>(x)), None)',
        reportCombine: 'functools.reduce(<#2>, <#1>)',
        doForEach: 'for <#1> in <#2>:\n    <#3>'
    },

    javascript: {
        string: "'<#1>'",
        number: '<#1>',
        boolTrue: 'true',
        boolFalse: 'false',
        reify: '<#1>',
        delim: ', ',
        item: '<#1>',
        list: '[<#1>]',
        parms_delim: ', ',
        parms_item: '<#1>',
        parms_list: '<#1>',
        tempvars_delim: ', ',
        tempvars_item: '<#1>',
        tempvars_list: '<#1>',

        receiveGo: '// when green flag clicked',
        receiveKey: '// when <#1> key pressed',
        receiveInteraction: '// when I am <#1>',
        receiveMessage: '// when I receive "<#1>"',
        receiveCondition: '// when <#1>',
        receiveOnClone: '// when I start as a clone',

        forward: 'move(<#1>);',
        turn: 'turnRight(<#1>);',
        turnLeft: 'turnLeft(<#1>);',
        setHeading: 'pointInDirection(<#1>);',
        doFaceTowards: 'pointTowards(<#1>);',
        gotoXY: 'goTo(<#1>, <#2>);',
        doGotoObject: 'goTo(<#1>);',
        doGlide: 'glide(<#1>, <#2>, <#3>);',
        changeXPosition: 'changeX(<#1>);',
        setXPosition: 'setX(<#1>);',
        changeYPosition: 'changeY(<#1>);',
        setYPosition: 'setY(<#1>);',
        bounceOffEdge: 'ifOnEdgeBounce();',
        xPosition: 'xPosition()',
        yPosition: 'yPosition()',
        direction: 'direction()',
        getPosition: 'position()',

        doSayFor: 'say(<#1>, <#2>);',
        bubble: 'say(<#1>);',
        doThinkFor: 'think(<#1>, <#2>);',
        doThink: 'think(<#1>);',
        doSwitchToCostume: 'switchCostume(<#1>);',
        doWearNextCostume: 'nextCostume();',
        changeEffect: 'changeEffect("<#1>", <#2>);',
        setEffect: 'setEffect("<#1>", <#2>);',
        clearEffects: 'clearGraphicEffects();',
        changeScale: 'changeSize(<#1>);',
        setScale: 'setSize(<#1>);',
        show: 'show();',
        hide: 'hide();',
        getScale: 'size()',

        playSound: 'playSound(<#1>);',
        doPlaySoundUntilDone: 'playSoundUntilDone(<#1>);',
        doStopAllSounds: 'stopAllSounds();',
        doRest: 'rest(<#1>);',
        doPlayNote: 'playNote(<#1>, <#2>);',
        doChangeTempo: 'changeTempo(<#1>);',
        doSetTempo: 'setTempo(<#1>);',
        getTempo: 'tempo()',

        clear: 'clear();',
        down: 'penDown();',
        up: 'penUp();',
        setColor: 'setPenColor(<#1>);',
        changeSize: 'changePenSize(<#1>);',
        setSize: 'setPenSize(<#1>);',
        doStamp: 'stamp();',
        floodFill: 'fill();',

        doWait: 'await wait(<#1>);',
        doWaitUntil: 'await waitUntil(() => <#1>);',
        doForever: 'while (true) {\n    <#1>\n}',
        doRepeat: 'for (let _i = 0; _i < <#1>; _i++) {\n    <#2>\n}',
        doUntil: 'while (!(<#1>)) {\n    <#2>\n}',
        doFor: 'for (let <#1> = <#2>; <#1> <= <#3>; <#1>++) {\n    <#4>\n}',
        doIf: 'if (<#1>) {\n    <#2>\n}',
        doIfElse: 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}',
        doReport: 'return <#1>;',
        doStopThis: 'return;',
        doStopAll: 'stopAll();',
        doRun: '<#1>(<#2>);',
        fork: 'queueMicrotask(() => <#1>(<#2>));',
        evaluate: '<#1>(<#2>)',
        doBroadcast: 'broadcast("<#1>");',
        doBroadcastAndWait: 'await broadcastAndWait("<#1>");',
        createClone: 'createClone(<#1>);',
        removeClone: 'deleteThisClone();',
        doPauseAll: 'pauseAll();',

        reportTouchingObject: 'touching(<#1>)',
        reportTouchingColor: 'touchingColor(<#1>)',
        reportColorIsTouchingColor: 'colorIsTouching(<#1>, <#2>)',
        doAsk: 'await ask(<#1>);',
        reportLastAnswer: 'answer()',
        getLastAnswer: 'answer()',
        reportMouseX: 'mouseX()',
        reportMouseY: 'mouseY()',
        reportMouseDown: 'mouseDown()',
        reportKeyPressed: 'keyPressed(<#1>)',
        doResetTimer: 'resetTimer();',
        reportTimer: 'timer()',
        getTimer: 'timer()',
        reportDate: 'current("<#1>")',
        reportURL: 'await httpGet(<#1>)',

        reportSum: '(<#1> + <#2>)',
        reportDifference: '(<#1> - <#2>)',
        reportProduct: '(<#1> * <#2>)',
        reportQuotient: '(<#1> / <#2>)',
        reportModulus: '(<#1> % <#2>)',
        reportPower: 'Math.pow(<#1>, <#2>)',
        reportRound: 'Math.round(<#1>)',
        reportMonadic: 'Math.<#1>(<#2>)',
        reportRandom: '(<#1> + Math.floor(Math.random() * ((<#2>) - (<#1>) + 1)))',
        reportLessThan: '(<#1> < <#2>)',
        reportEquals: '(<#1> === <#2>)',
        reportGreaterThan: '(<#1> > <#2>)',
        reportAnd: '(<#1> && <#2>)',
        reportOr: '(<#1> || <#2>)',
        reportNot: '(!(<#1>))',
        reportBoolean: '<#1>',
        reportTrue: 'true',
        reportFalse: 'false',
        reportJoinWords: '[<#1>].join("")',
        reportTextAttribute: '(<#2>).length',
        reportLetter: '(<#2>)[<#1> - 1]',
        reportUnicode: '(<#1>).charCodeAt(0)',
        reportUnicodeAsLetter: 'String.fromCharCode(<#1>)',
        reportIsA: '(typeof <#1> === "<#2>")',
        reportIsIdentical: '(<#1> === <#2>)',
        reportTextSplit: '(<#1>).split(<#2>)',
        reportVariadicSum: '(<#1>)',
        reportVariadicProduct: '(<#1>)',
        reportVariadicMin: 'Math.min(<#1>)',
        reportVariadicMax: 'Math.max(<#1>)',
        reportVariadicLessThan: '(<#1>)',
        reportVariadicEquals: '(<#1>)',
        reportVariadicGreaterThan: '(<#1>)',
        reportVariadicAnd: '(<#1>)',
        reportVariadicOr: '(<#1>)',

        doSetVar: '<#1> = <#2>;',
        doChangeVar: '<#1> += <#2>;',
        doShowVar: 'showVariable("<#1>");',
        doHideVar: 'hideVariable("<#1>");',
        doDeclareVariables: 'let <#1>;',

        reportNewList: '[<#1>]',
        reportCONS: '[<#1>, ...<#2>]',
        reportListItem: '(<#2>)[<#1> - 1]',
        reportCDR: '(<#1>).slice(1)',
        reportListAttribute: '(<#1>).length',
        reportListContainsItem: '(<#1>).includes(<#2>)',
        reportListIsEmpty: '((<#1>).length === 0)',
        reportListIndex: '((<#2>).indexOf(<#1>) + 1)',
        doAddToList: '(<#2>).push(<#1>);',
        doDeleteFromList: '(<#2>).splice(<#1> - 1, 1);',
        doInsertInList: '(<#3>).splice(<#2> - 1, 0, <#1>);',
        doReplaceInList: '(<#3>)[<#2> - 1] = <#1>;',
        reportNumbers: 'Array.from({length: (<#2>) - (<#1>) + 1}, (_, i) => (<#1>) + i)',
        reportConcatenatedLists: '[].concat(<#1>)',
        reportMap: '(<#2>).map(<#1>)',
        reportKeep: '(<#2>).filter(<#1>)',
        reportFindFirst: '(<#2>).find(<#1>)',
        reportCombine: '(<#1>).reduce(<#2>)',
        doForEach: 'for (const <#1> of <#2>) {\n    <#3>\n}'
    },

    java: {
        string: '"<#1>"',
        number: '<#1>',
        boolTrue: 'true',
        boolFalse: 'false',
        reify: '<#1>',
        delim: ', ',
        item: '<#1>',
        list: 'List.of(<#1>)',
        parms_delim: ', ',
        parms_item: '<#1>',
        parms_list: '<#1>',
        tempvars_delim: ', ',
        tempvars_item: '<#1>',
        tempvars_list: '<#1>',

        receiveGo: '// when green flag clicked',
        receiveKey: '// when <#1> key pressed',
        receiveInteraction: '// when I am <#1>',
        receiveMessage: '// when I receive "<#1>"',
        receiveCondition: '// when <#1>',
        receiveOnClone: '// when I start as a clone',

        forward: 'move(<#1>);',
        turn: 'turnRight(<#1>);',
        turnLeft: 'turnLeft(<#1>);',
        setHeading: 'pointInDirection(<#1>);',
        doFaceTowards: 'pointTowards(<#1>);',
        gotoXY: 'goTo(<#1>, <#2>);',
        doGotoObject: 'goTo(<#1>);',
        doGlide: 'glide(<#1>, <#2>, <#3>);',
        changeXPosition: 'changeX(<#1>);',
        setXPosition: 'setX(<#1>);',
        changeYPosition: 'changeY(<#1>);',
        setYPosition: 'setY(<#1>);',
        bounceOffEdge: 'ifOnEdgeBounce();',
        xPosition: 'xPosition()',
        yPosition: 'yPosition()',
        direction: 'direction()',

        doSayFor: 'say(<#1>, <#2>);',
        bubble: 'say(<#1>);',
        doThinkFor: 'think(<#1>, <#2>);',
        doThink: 'think(<#1>);',
        show: 'show();',
        hide: 'hide();',

        clear: 'clear();',
        down: 'penDown();',
        up: 'penUp();',
        doStamp: 'stamp();',

        doWait: 'wait(<#1>);',
        doWaitUntil: 'waitUntil(<#1>);',
        doForever: 'while (true) {\n    <#1>\n}',
        doRepeat: 'for (int _i = 0; _i < <#1>; _i++) {\n    <#2>\n}',
        doUntil: 'while (!(<#1>)) {\n    <#2>\n}',
        doFor: 'for (int <#1> = <#2>; <#1> <= <#3>; <#1>++) {\n    <#4>\n}',
        doIf: 'if (<#1>) {\n    <#2>\n}',
        doIfElse: 'if (<#1>) {\n    <#2>\n} else {\n    <#3>\n}',
        doReport: 'return <#1>;',
        doStopThis: 'return;',
        doBroadcast: 'broadcast("<#1>");',
        doBroadcastAndWait: 'broadcastAndWait("<#1>");',

        reportMouseX: 'mouseX()',
        reportMouseY: 'mouseY()',
        reportMouseDown: 'mouseDown()',
        reportKeyPressed: 'keyPressed(<#1>)',
        reportTimer: 'timer()',
        getTimer: 'timer()',

        reportSum: '(<#1> + <#2>)',
        reportDifference: '(<#1> - <#2>)',
        reportProduct: '(<#1> * <#2>)',
        reportQuotient: '(<#1> / <#2>)',
        reportModulus: '(<#1> % <#2>)',
        reportPower: 'Math.pow(<#1>, <#2>)',
        reportRound: 'Math.round(<#1>)',
        reportRandom: '(<#1> + (int)(Math.random() * ((<#2>) - (<#1>) + 1)))',
        reportLessThan: '(<#1> < <#2>)',
        reportEquals: '(<#1> == <#2>)',
        reportGreaterThan: '(<#1> > <#2>)',
        reportAnd: '(<#1> && <#2>)',
        reportOr: '(<#1> || <#2>)',
        reportNot: '(!(<#1>))',
        reportBoolean: '<#1>',
        reportTrue: 'true',
        reportFalse: 'false',
        reportJoinWords: 'String.join("", <#1>)',
        reportTextAttribute: '(<#2>).length()',
        reportLetter: 'String.valueOf((<#2>).charAt(<#1> - 1))',
        reportVariadicSum: '(<#1>)',
        reportVariadicProduct: '(<#1>)',
        reportVariadicLessThan: '(<#1>)',
        reportVariadicEquals: '(<#1>)',
        reportVariadicGreaterThan: '(<#1>)',
        reportVariadicAnd: '(<#1>)',
        reportVariadicOr: '(<#1>)',

        doSetVar: '<#1> = <#2>;',
        doChangeVar: '<#1> += <#2>;',
        doDeclareVariables: 'Object <#1> = null;',

        reportNewList: 'new ArrayList<>(List.of(<#1>))',
        reportListItem: '(<#2>).get(<#1> - 1)',
        reportListAttribute: '(<#1>).size()',
        reportListContainsItem: '(<#1>).contains(<#2>)',
        reportListIsEmpty: '(<#1>).isEmpty()',
        doAddToList: '(<#2>).add(<#1>);',
        doDeleteFromList: '(<#2>).remove(<#1> - 1);',
        doInsertInList: '(<#3>).add(<#2> - 1, <#1>);',
        doReplaceInList: '(<#3>).set(<#2> - 1, <#1>);',
        doForEach: 'for (Object <#1> : <#2>) {\n    <#3>\n}'
    },

    lua: {
        string: '"<#1>"',
        number: '<#1>',
        boolTrue: 'true',
        boolFalse: 'false',
        reify: '<#1>',
        delim: ', ',
        item: '<#1>',
        list: '{<#1>}',
        parms_delim: ', ',
        parms_item: '<#1>',
        parms_list: '<#1>',
        tempvars_delim: ', ',
        tempvars_item: '<#1>',
        tempvars_list: '<#1>',

        receiveGo: '-- when green flag clicked',
        receiveKey: '-- when <#1> key pressed',
        receiveInteraction: '-- when I am <#1>',
        receiveMessage: '-- when I receive "<#1>"',
        receiveCondition: '-- when <#1>',
        receiveOnClone: '-- when I start as a clone',

        forward: 'move(<#1>)',
        turn: 'turn_right(<#1>)',
        turnLeft: 'turn_left(<#1>)',
        setHeading: 'point_in_direction(<#1>)',
        doFaceTowards: 'point_towards(<#1>)',
        gotoXY: 'go_to(<#1>, <#2>)',
        doGotoObject: 'go_to(<#1>)',
        doGlide: 'glide(<#1>, <#2>, <#3>)',
        changeXPosition: 'change_x(<#1>)',
        setXPosition: 'set_x(<#1>)',
        changeYPosition: 'change_y(<#1>)',
        setYPosition: 'set_y(<#1>)',
        bounceOffEdge: 'if_on_edge_bounce()',
        xPosition: 'x_position()',
        yPosition: 'y_position()',
        direction: 'direction()',

        doSayFor: 'say(<#1>, <#2>)',
        bubble: 'say(<#1>)',
        doThinkFor: 'think(<#1>, <#2>)',
        doThink: 'think(<#1>)',
        show: 'show()',
        hide: 'hide()',

        clear: 'clear()',
        down: 'pen_down()',
        up: 'pen_up()',
        doStamp: 'stamp()',

        doWait: 'wait(<#1>)',
        doWaitUntil: 'wait_until(function() return <#1> end)',
        doForever: 'while true do\n    <#1>\nend',
        doRepeat: 'for _ = 1, <#1> do\n    <#2>\nend',
        doUntil: 'while not (<#1>) do\n    <#2>\nend',
        doFor: 'for <#1> = <#2>, <#3> do\n    <#4>\nend',
        doIf: 'if <#1> then\n    <#2>\nend',
        doIfElse: 'if <#1> then\n    <#2>\nelse\n    <#3>\nend',
        doReport: 'return <#1>',
        doStopThis: 'return',
        doBroadcast: 'broadcast("<#1>")',
        doBroadcastAndWait: 'broadcast_and_wait("<#1>")',

        reportMouseX: 'mouse_x()',
        reportMouseY: 'mouse_y()',
        reportMouseDown: 'mouse_down()',
        reportKeyPressed: 'key_pressed(<#1>)',
        reportTimer: 'timer()',
        getTimer: 'timer()',

        reportSum: '(<#1> + <#2>)',
        reportDifference: '(<#1> - <#2>)',
        reportProduct: '(<#1> * <#2>)',
        reportQuotient: '(<#1> / <#2>)',
        reportModulus: '(<#1> % <#2>)',
        reportPower: '(<#1> ^ <#2>)',
        reportRound: 'math.floor(<#1> + 0.5)',
        reportRandom: 'math.random(<#1>, <#2>)',
        reportLessThan: '(<#1> < <#2>)',
        reportEquals: '(<#1> == <#2>)',
        reportGreaterThan: '(<#1> > <#2>)',
        reportAnd: '(<#1> and <#2>)',
        reportOr: '(<#1> or <#2>)',
        reportNot: '(not <#1>)',
        reportBoolean: '<#1>',
        reportTrue: 'true',
        reportFalse: 'false',
        reportJoinWords: 'table.concat({<#1>})',
        reportTextAttribute: '(#<#2>)',
        reportLetter: 'string.sub(<#2>, <#1>, <#1>)',
        reportVariadicSum: '(<#1>)',
        reportVariadicProduct: '(<#1>)',
        reportVariadicLessThan: '(<#1>)',
        reportVariadicEquals: '(<#1>)',
        reportVariadicGreaterThan: '(<#1>)',
        reportVariadicAnd: '(<#1>)',
        reportVariadicOr: '(<#1>)',

        doSetVar: '<#1> = <#2>',
        doChangeVar: '<#1> = <#1> + <#2>',
        doDeclareVariables: 'local <#1>',

        reportNewList: '{<#1>}',
        reportListItem: '(<#2>)[<#1>]',
        reportListAttribute: '(#<#1>)',
        reportListContainsItem: 'table_contains(<#1>, <#2>)',
        reportListIsEmpty: '(#<#1> == 0)',
        doAddToList: 'table.insert(<#2>, <#1>)',
        doDeleteFromList: 'table.remove(<#2>, <#1>)',
        doInsertInList: 'table.insert(<#3>, <#2>, <#1>)',
        doReplaceInList: '(<#3>)[<#2>] = <#1>',
        doForEach: 'for _, <#1> in ipairs(<#2>) do\n    <#3>\nend'
    }
};

SnapCodifier.applyLanguage = function (langId) {
    var template = this.templates[langId] || this.templates.python,
        target = StageMorph.prototype.codeMappings,
        key;
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
    this.language = langId;
};

SnapCodifier.currentMeta = function () {
    return this.languages[this.language] || this.languages.python;
};

SnapCodifier.sanitizeIdentifier = function (name) {
    return String(name || 'sprite')
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/^(\d)/, '_$1');
};

SnapCodifier.blockFallback = function (block) {
    var meta = this.currentMeta(),
        label;
    try {
        label = block.abstractBlockSpec ? block.abstractBlockSpec()
            : (block.blockSpec || block.selector || 'block');
    } catch (err) {
        label = block.selector || 'block';
    }
    return meta.comment + ' [unmapped: ' + label + ']';
};

SnapCodifier.ensureFallbacks = function (block) {
    // Walk the script stack and give unmapped selectors a comment stub
    // so they still appear in the live output.
    var cursor = block,
        sel;
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
                var nested = input.nestedBlock();
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
    var meta = this.currentMeta(),
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

SnapCodifier.generate = function (ide) {
    var meta = this.currentMeta(),
        parts = [],
        sprite,
        stage,
        text,
        prelude;

    if (!ide) {
        return meta.empty;
    }

    // Apply selected language mappings for this generation pass.
    // Preserve any user/project mappings by snapshot + restore in place
    // so scene references to codeMappings stay valid.
    var targetMaps = StageMorph.prototype.codeMappings,
        previous = Object.assign({}, targetMaps),
        key;
    try {
        this.applyLanguage(this.language);
        if (this.scope === 'all') {
            stage = ide.stage;
            if (stage) {
                text = this.generateForSprite(stage);
                if (text) { parts.push(text); }
            }
            if (ide.sprites && ide.sprites.asArray) {
                ide.sprites.asArray().forEach(spr => {
                    text = this.generateForSprite(spr);
                    if (text) { parts.push(text); }
                });
            }
        } else {
            sprite = ide.currentSprite || ide.stage;
            text = this.generateForSprite(sprite);
            if (text) { parts.push(text); }
        }
    } finally {
        for (key in targetMaps) {
            if (Object.prototype.hasOwnProperty.call(targetMaps, key)) {
                delete targetMaps[key];
            }
        }
        Object.assign(targetMaps, previous);
    }

    if (!parts.length) {
        return meta.empty;
    }

    prelude = meta.comment + ' Generated live from Snap!  →  ' + meta.label +
        '\n' + meta.comment + ' Output only — edit blocks on the left to change this.\n\n';
    if (this.language === 'python') {
        prelude += 'import random\nimport functools\n\n';
    } else if (this.language === 'java') {
        prelude += 'import java.util.*;\n\n' +
            'public class SnapExport {\n' +
            '    public static void main(String[] args) {\n' +
            '        // scripts below\n' +
            '    }\n' +
            '}\n\n';
    }
    return prelude + parts.join('\n');
};

// CodePaneMorph ///////////////////////////////////////////////////////
//
// Docked side panel: live textual view of the current Snap scripts.

CodePaneMorph.prototype = new Morph();
CodePaneMorph.prototype.constructor = CodePaneMorph;
CodePaneMorph.uber = Morph.prototype;

CodePaneMorph.prototype.defaultWidth = 340;

function CodePaneMorph(ide) {
    this.init(ide);
}

CodePaneMorph.prototype.init = function (ide) {
    CodePaneMorph.uber.init.call(this);
    this.ide = ide;
    this.color = ide ? ide.groupColor : new Color(40, 40, 40);
    this.cachedCode = '';
    this.pollEvery = 0.35; // seconds
    this.fps = 4;
    this.build();
};

CodePaneMorph.prototype.styleButton = function (btn, colors, labelColor) {
    btn.corner = 8;
    btn.padding = 2;
    btn.color = colors[0];
    btn.highlightColor = colors[1];
    btn.pressColor = colors[2];
    btn.labelColor = labelColor;
    btn.contrast = 30;
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
        null,
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
    btn.labelMinExtent = new Point(72, 18);
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
    btn.labelMinExtent = new Point(80, 18);
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

    // Code body
    this.codeBody = new TextMorph(
        SnapCodifier.currentMeta().empty,
        12,
        'monospace',
        false,
        false,
        false,
        null,
        null,
        ide.isBright ? new Color(30, 30, 30) : new Color(210, 230, 210)
    );
    this.codeBody.isEditable = false;
    this.codeBody.enableSelecting();
    this.codeBody.maxWidth = 0;

    // ScrollFrameMorph expects a FrameMorph as contents; add the text into it.
    this.scroller = new ScrollFrameMorph(null, null, ide.sliderColor);
    this.scroller.color = ide.isBright ?
        new Color(250, 250, 252) : new Color(24, 28, 24);
    this.scroller.acceptsDrops = false;
    this.scroller.contents.acceptsDrops = false;
    this.scroller.isTextLineWrapping = true;
    this.scroller.padding = 4;
    this.scroller.setContents(this.codeBody);
    this.add(this.scroller);

    // Resize handle (bottom-right of pane)
    this.resizer = new HandleMorph(this, 220, 120, 0, 0);
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
    this.codeBody.changed();
    this.scroller.contents.adjustBounds();
    this.scroller.adjustScrollBars();
    this.refreshButtonLabels();
};

CodePaneMorph.prototype.step = function () {
    if (!this.isVisible) { return; }
    this.refresh(false);
};

CodePaneMorph.prototype.fixLayout = function () {
    var pad = 6,
        headerH = 30,
        x = this.left() + pad,
        y = this.top() + pad,
        innerW = Math.max(40, this.width() - pad * 2),
        innerH,
        cursorX;

    if (!this.header || !this.scroller || !this.codeBody) { return; }

    this.header.setPosition(new Point(x, y));
    this.header.setExtent(new Point(innerW, headerH));

    cursorX = this.header.left() + 4;
    this.title.setCenter(this.header.center());
    this.title.setLeft(cursorX);
    cursorX = this.title.right() + 8;

    [this.langButton, this.scopeButton, this.copyButton, this.exportButton]
        .forEach(button => {
            if (!button) { return; }
            button.setCenter(this.header.center());
            button.setLeft(cursorX);
            cursorX = button.right() + 4;
        });

    if (this.closeButton) {
        this.closeButton.setCenter(this.header.center());
        this.closeButton.setRight(this.header.right() - 4);
    }

    y = this.header.bottom() + pad;
    innerH = Math.max(40, this.bottom() - y - pad);
    this.scroller.setPosition(new Point(x, y));
    this.scroller.setExtent(new Point(innerW, innerH));
    this.codeBody.maxWidth = Math.max(
        40,
        innerW - MorphicPreferences.scrollBarSize - 8
    );
    this.codeBody.fixLayout();
    this.scroller.contents.adjustBounds();
    this.scroller.adjustScrollBars();
};

CodePaneMorph.prototype.setExtent = function (point) {
    CodePaneMorph.uber.setExtent.call(this, point);
    this.fixLayout();
    if (this.ide && this.width() >= 220) {
        this.ide.codePaneWidth = this.width();
    }
};
