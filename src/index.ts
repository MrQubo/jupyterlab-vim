import * as CodeMirror from 'codemirror';

import {
    JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    INotebookTracker, NotebookActions, NotebookPanel
} from '@jupyterlab/notebook';

import {
    MarkdownCell
} from '@jupyterlab/cells';

import {
    CodeEditor
} from '@jupyterlab/codeeditor';

import {
    CodeMirrorEditor
} from '@jupyterlab/codemirror';

import {
    ISettingRegistry
} from '@jupyterlab/settingregistry';

import {
    ReadonlyPartialJSONObject,
    JSONObject
} from '@lumino/coreutils';

import {
    ElementExt
} from '@lumino/domutils';

import '../style/index.css';
// Previously the vim keymap was loaded by JupyterLab, but now
// it is lazy loaded, so we have to load it explicitly
import 'codemirror/keymap/vim.js';

/**
 * A boolean indicating whether the platform is Mac.
 */
const IS_MAC = !!navigator.platform.match(/Mac/i);

/**
 * Initialization data for the jupyterlab_vim extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
    id: '@mrqubo/jupyterlab_vim',
    autoStart: true,
    activate: activateCellVim,
    requires: [INotebookTracker, ISettingRegistry]
};

class VimCell {

    constructor(
        app: JupyterFrontEnd,
        tracker: INotebookTracker,
        settingRegistry: ISettingRegistry
    ) {
        this._editorConfig = {
            ...CodeEditor.defaultConfig,
        };
        this._codeMirrorConfig = {
            keyMap: 'vim',
            theme: CodeMirrorEditor.defaultConfig.theme,
            styleActiveLine: CodeMirrorEditor.defaultConfig.styleActiveLine,
            styleSelectedText: CodeMirrorEditor.defaultConfig.styleSelectedText,
            selectionPointer: CodeMirrorEditor.defaultConfig.selectionPointer,
            lineWiseCopyCut: CodeMirrorEditor.defaultConfig.lineWiseCopyCut,
        };

        this._tracker = tracker;
        this._app = app;

        settingRegistry.load('@jupyterlab/fileeditor-extension:plugin')
        .then(settings => {
            this._setFileEditorSettings(settings);
            settings.changed.connect(settings => this._updateFileEditorSettings(settings));
        });
        settingRegistry.load('@jupyterlab/codemirror-extension:commands')
        .then(settings => {
            this._setCodeMirrorSettings(settings);
            settings.changed.connect(settings => this._updateCodeMirrorSettings(settings));
        });

        this._onActiveCellChanged();
        this._tracker.activeCellChanged.connect(this._onActiveCellChanged, this);
    }

    private _onActiveCellChanged(): void {
        // if (this._prevActive && !this._prevActive.isDisposed) {
        //     this._prevActive.metadata.changed.disconnect(this._onMetadataChanged, this);
        // }
        let activeCell = this._tracker.activeCell;
        if (activeCell !== null) {
            const {commands} = this._app;
            let editor = activeCell.editor as CodeMirrorEditor;
            let lcm = CodeMirror as any;
            let lvim = lcm.Vim as any;

            this._setEditorConfig(this._editorConfig);
            this._setCodeMirrorConfig(this._codeMirrorConfig);

            let extraKeys = editor.getOption('extraKeys') || {};
            if (!IS_MAC) {
                extraKeys['Ctrl-C'] = false;
            }
            editor.setOption('extraKeys', extraKeys);

            (CodeMirror as any).prototype.save = () => {
                commands.execute('docmanager:save');
            };

            lvim.handleKey(editor.editor, '<Esc>');

            lvim.defineEx('quit', 'q', function(cm: any) {
                commands.execute('notebook:enter-command-mode');
            });

            // See https://github.com/codemirror/CodeMirror/issues/6234
            /* lvim.defineAction('enterNotebookCommandMode', (cm: any) => {
             *     commands.execute('notebook:enter-command-mode');
             * });
             *
             * lvim.mapCommand(
             *     '<Esc>', 'action', 'enterNotebookCommandMode',
             *     {},
             *     { context: 'normal', isEdit: false },
             * ); */

            lvim.defineAction('moveCellDown', (cm: any, actionArgs: any) => {
                commands.execute('notebook:move-cell-down');
            });
            lvim.defineAction('moveCellUp', (cm: any, actionArgs: any) => {
                commands.execute('notebook:move-cell-up');
            });
            lvim.mapCommand('<C-e>', 'action', 'moveCellDown', {}, {extra: 'normal'});
            lvim.mapCommand('<C-y>', 'action', 'moveCellUp', {}, {extra: 'normal'});
            lvim.defineAction('splitCell', (cm: any, actionArgs: any) => {
                commands.execute('notebook:split-cell-at-cursor');
            });
            lvim.mapCommand('-', 'action', 'splitCell', {}, {extra: 'normal'});
        }
    }

    private _setCodeMirrorConfig(codeMirrorConfig: Partial<CodeMirrorEditor.IConfig>) {
        this._codeMirrorConfig = {
            ...codeMirrorConfig,
            ...this._editorConfig,
        };

        const { activeCell } = this._tracker;
        if (activeCell !== null && activeCell.editor instanceof CodeMirrorEditor) {
            const { editor } = activeCell.editor;
            Object.keys(codeMirrorConfig).forEach((key: any) => {
                editor.setOption(key, (codeMirrorConfig as any)[key]);
            });
        }
    }

    private _updateCodeMirrorConfig(codeMirrorConfig: Partial<CodeMirrorEditor.IConfig>) {
        this._setCodeMirrorConfig(codeMirrorConfig);
    }

    private _setEditorConfig(editorConfig: CodeEditor.IConfig) {
        this._editorConfig = editorConfig;

        const { activeCell } = this._tracker;
        if (activeCell !== null) {
            const { editor } = activeCell;
            Object.keys(editorConfig).forEach((key: keyof CodeEditor.IConfig) => {
                editor.setOption(key, editorConfig[key]);
            });
        }
    }

    private _updateEditorConfig(editorConfig: CodeEditor.IConfig) {
        this._editorConfig = editorConfig;

        const { activeCell } = this._tracker;
        if (activeCell !== null) {
            const { editor } = activeCell;
            const transientConfigs = ['lineNumbers', 'lineWrap', 'matchBrackets'];
            Object.keys(editorConfig).forEach((key: keyof CodeEditor.IConfig) => {
                if (!transientConfigs.includes(key)) {
                    editor.setOption(key, editorConfig[key]);
                }
            });
        }
    }

    private _setFileEditorSettings(settings: ISettingRegistry.ISettings) {
        this._setEditorConfig(this._settingsToEditorConfig(settings));
    }

    private _updateFileEditorSettings(settings: ISettingRegistry.ISettings) {
        this._updateEditorConfig(this._settingsToEditorConfig(settings));
    }

    private _setCodeMirrorSettings(settings: ISettingRegistry.ISettings) {
        this._setCodeMirrorConfig(this._settingsToCodeMirrorConfig(settings));
    }

    private _updateCodeMirrorSettings(settings: ISettingRegistry.ISettings) {
        this._updateCodeMirrorConfig(this._settingsToCodeMirrorConfig(settings));
    }

    private _settingsToEditorConfig(settings: ISettingRegistry.ISettings): CodeEditor.IConfig {
        return {
            ...CodeEditor.defaultConfig,
            ...(settings.get('editorConfig').composite as JSONObject)
        };
    }

    private _settingsToCodeMirrorConfig(settings: ISettingRegistry.ISettings): Partial<CodeMirrorEditor.IConfig> {
        const config: Partial<CodeMirrorEditor.IConfig> = {};

        config.keyMap = 'vim';

        config.theme =
            (settings.get('theme').composite as string | null)
            || this._codeMirrorConfig.theme;

        config.styleActiveLine =
            (settings.get('styleActiveLine').composite as
                | boolean
                | CodeMirror.StyleActiveLine)
            ?? this._codeMirrorConfig.styleActiveLine;

        config.styleSelectedText =
            (settings.get('styleSelectedText').composite as boolean)
            ?? this._codeMirrorConfig.styleSelectedText;

        config.selectionPointer =
            (settings.get('selectionPointer').composite as boolean | string)
            ?? this._codeMirrorConfig.selectionPointer;

        config.lineWiseCopyCut =
            (settings.get('lineWiseCopyCut').composite as boolean)
            ?? this._codeMirrorConfig.lineWiseCopyCut;

        return config;
    }

    private _tracker: INotebookTracker;
    private _app: JupyterFrontEnd;

    private _editorConfig: CodeEditor.IConfig;
    private _codeMirrorConfig: Partial<CodeMirrorEditor.IConfig>;
}

function activateCellVim(
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
): Promise<void> {

    Promise.all([app.restored]).then(([args]) => {
        const { commands, shell } = app;
        function getCurrent(args: ReadonlyPartialJSONObject): NotebookPanel | null {
            const widget = tracker.currentWidget;
            const activate = args['activate'] !== false;

            if (activate && widget) {
                shell.activateById(widget.id);
            }

            return widget;
        }
        function isEnabled(): boolean {
            return tracker.currentWidget !== null &&
                tracker.currentWidget === app.shell.currentWidget;
        }

        commands.addCommand('run-select-next-edit', {
            label: 'Run Cell and Edit Next Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAndAdvance(content, context.sessionContext);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-cell-and-edit', {
            label: 'Run Cell and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.run(content, context.sessionContext);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('cut-cell-and-edit', {
            label: 'Cut Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.cut(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('copy-cell-and-edit', {
            label: 'Copy Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.copy(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('paste-cell-and-edit', {
            label: 'Paste Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.paste(content, 'below');
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('merge-and-edit', {
            label: 'Merge and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.mergeCells(content);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('enter-insert-mode', {
            label: 'Enter Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        current.content.mode = 'edit';
                        (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('pass-escape-to-vim-or-enter-command-mode', {
            label: 'Pass Escape to Vim or Enter Command Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        const lvim = (CodeMirror as any).Vim;
                        const vim = lvim.maybeInitVimState_(editor.editor);
                        if (vim.insertMode || vim.visualMode) {
                            const success = lvim.handleKey(editor.editor, '<Esc>');
                            if (success) {
                                return;
                            }
                        }
                    }
                }
                commands.execute('notebook:enter-command-mode');
            },
            isEnabled
        });
        commands.addCommand('select-below-execute-markdown', {
            label: 'Execute Markdown and Select Cell Below',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null &&
                        content.activeCell.model.type === 'markdown') {
                        (current.content.activeCell as MarkdownCell).rendered = true;
                    }
                    return NotebookActions.selectBelow(current.content);
                }
            },
            isEnabled
        });
        commands.addCommand('select-above-execute-markdown', {
            label: 'Execute Markdown and Select Cell Below',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null &&
                        content.activeCell.model.type === 'markdown') {
                        (current.content.activeCell as MarkdownCell).rendered = true;
                    }
                    return NotebookActions.selectAbove(current.content);
                }
            },
            isEnabled
        });
        commands.addCommand('select-first-cell', {
            label: 'Select First Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = 0;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('select-last-cell', {
            label: 'Select Last Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = current.content.widgets.length - 1;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('center-cell', {
            label: 'Center Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current && current.content.activeCell != null) {
                    let er = current.content.activeCell.inputArea.node.getBoundingClientRect();
                    current.content.scrollToPosition(er.bottom, 0);
                }
            },
            isEnabled
        });

        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'U'],
         *     command: 'notebook:undo-cell-action'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', '-'],
         *     command: 'notebook:split-cell-at-cursor'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'D'],
         *     command: 'cut-cell-and-edit'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'Y'],
         *     command: 'copy-cell-and-edit'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'P'],
         *     command: 'paste-cell-and-edit'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl Shift J'],
         *     command: 'notebook:extend-marked-cells-below'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Ctrl Shift J'],
         *     command: 'notebook:extend-marked-cells-below'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl Shift K'],
         *     command: 'notebook:extend-marked-cells-above'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Ctrl Shift K'],
         *     command: 'notebook:extend-marked-cells-above'
         * }); */
        // this one doesn't work yet
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl O', 'Shift O'],
            command: 'notebook:insert-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl O', 'Ctrl O'],
            command: 'notebook:insert-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl O', 'O'],
            command: 'notebook:insert-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl J'],
            command: 'select-below-execute-markdown'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl K'],
            command: 'select-above-execute-markdown'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Escape'],
            command: 'pass-escape-to-vim-or-enter-command-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['I'],
            command: 'enter-insert-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl Enter'],
            command: 'run-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Shift Enter'],
            command: 'run-select-next-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Shift Escape'],
            command: 'notebook:enter-command-mode'
        });
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Shift M'],
         *     command: 'merge-and-edit'
         * }); */
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Accel 1'],
            command: 'notebook:change-cell-to-code'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Accel 2'],
            command: 'notebook:change-cell-to-markdown'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Accel 3'],
            command: 'notebook:change-cell-to-raw'
        });
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'G'],
         *     command: 'select-first-cell'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook.jp-mod-editMode',
         *     keys: ['Ctrl O', 'Ctrl G'],
         *     command: 'select-last-cell'
         * }); */
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['G', 'G'],
            command: 'select-first-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift G'],
            command: 'select-last-cell'
        });
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Y', 'Y'],
         *     command: 'notebook:copy-cell'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['D', 'D'],
         *     command: 'notebook:cut-cell'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Shift P'],
         *     command: 'notebook:paste-cell-above'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['P'],
         *     command: 'notebook:paste-cell-below'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['O'],
         *     command: 'notebook:insert-cell-below'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Shift O'],
         *     command: 'notebook:insert-cell-above'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['U'],
         *     command: 'notebook:undo-cell-action'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Ctrl E'],
         *     command: 'notebook:move-cell-down'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Ctrl Y'],
         *     command: 'notebook:move-cell-up'
         * }); */
        /* commands.addKeyBinding({
         *     selector: '.jp-Notebook:focus',
         *     keys: ['Z', 'Z'],
         *     command: 'center-cell'
         * }); */
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl O', 'Z', 'Z'],
            command: 'center-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode .jp-InputArea-editor:not(.jp-mod-has-primary-selection)',
            keys: ['Ctrl G'],
            command: 'tooltip:launch-notebook'
        });

        // tslint:disable:no-unused-expression
        new VimCell(app, tracker, settingRegistry);
    });

    return Promise.resolve();
}

export default extension;
