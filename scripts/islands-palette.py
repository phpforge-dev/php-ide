"""Generates src/themes.css from a hand-written token table (recorte 28).

Values are factual colors that follow the public Islands theme keys in
design/reference/islands/ (not bundled) or measurements of the authorized
PhpStorm screenshots in .artifacts/phpstorm-reference/. The third column names
the origin; docs/research/implementation-slice-28.md reproduces this table.
Run: python3 scripts/islands-palette.py  (rewrites src/themes.css)
"""
from pathlib import Path

# name: (dark, light, origin)
TOKENS = {
 # Surfaces
 'ij-window': ('#26282C', '#E9EAEE', 'MainWindow.background / MainToolbar.background / StatusBar.background'),
 'ij-island': ('#191A1C', '#FFFFFF', 'ToolWindow.background / EditorTabs.background (Island.borderColor)'),
 'ij-island-alt': ('#212326', '#F7F8F9', 'Table.stripeColor / *.background (light)'),
 'ij-stripe': ('#26282C', '#E9EAEE', 'ToolWindow.Stripe.background'),
 'ij-popup': ('#26282C', '#FFFFFF', 'Popup.background / PopupMenu.background / Menu.background'),
 'ij-popup-border': ('#33353B', '#D1D3D9', 'Popup.borderColor'),
 'ij-popup-footer': ('#26282C', '#F7F8F9', 'Popup.Advertiser.background'),
 'ij-popup-footer-text': ('#73767C', '#73767C', 'Popup.Advertiser.foreground'),
 'ij-dialog': ('#26282C', '#F7F8F9', 'AlertDialog.background / *.background (light)'),
 'ij-tooltip': ('#33353B', '#FFFFFF', 'ToolTip.background'),
 'ij-tooltip-border': ('#33353B', '#D1D3D9', 'ToolTip.borderColor'),
 'ij-tooltip-text': ('#D1D3D9', '#000000', 'ToolTip.foreground'),
 'ij-notification': ('#33353B', '#FFFFFF', 'Notification.background'),
 # Text
 'ij-text': ('#D1D3D9', '#000000', '*.foreground / MainToolbar.foreground (light)'),
 'ij-text-secondary': ('#9FA2A8', '#5F6269', 'StatusBar.Widget.foreground / ToolWindow.Button.foreground'),
 'ij-text-info': ('#73767C', '#73767C', '*.infoForeground'),
 'ij-text-disabled': ('#4C4F56', '#9FA2A8', '*.disabledForeground'),
 'ij-text-inactive-tab': ('#AFB1B6', '#4D4F55', 'observado: abas não selecionadas (05/40); EditorTabs.unselectedAlpha'),
 'ij-link': ('#71A1FE', '#2F5EB9', 'Link.activeForeground'),
 'ij-match': ('#538AF9', '#2F5EB9', 'CompletionPopup.matchForeground'),
 # Lines
 'ij-border': ('#33353B', '#E9EAEE', 'Separator.separatorColor / Borders.color (light)'),
 'ij-border-subtle': ('#26282C', '#E9EAEE', 'Borders.color / OnePixelDivider.background'),
 'ij-control-border': ('#40434A', '#D1D3D9', 'Component.borderColor / Button.startBorderColor'),
 'ij-toolbar-separator': ('#FFFFFF21', '#00000020', 'MainToolbar.separatorColor'),
 # Interaction
 'ij-hover': ('#FFFFFF17', '#00000012', 'ActionButton.hoverBackground'),
 'ij-pressed': ('#FFFFFF29', '#00000020', 'ActionButton.pressedBackground'),
 'ij-list-hover': ('#FFFFFF10', '#00000008', 'List.hoverBackground / Tree.hoverBackground'),
 'ij-selection': ('#2A4371', '#D0DFFE', '*.selectionBackground'),
 'ij-selection-text': ('#D1D3D9', '#000000', '*.selectionForeground'),
 'ij-selection-inactive': ('#33353B', '#E9EAEE', '*.selectionInactiveBackground'),
 'ij-selection-light': ('#233558', '#E3EBFE', '*.lightSelectionBackground'),
 'ij-focus': ('#3871E1', '#3871E1', '*.focusColor / ActionButton.focusedBorderColor'),
 'ij-stripe-selected': ('#FFFFFF1C', '#00000014', 'observado: botão de faixa aberto sem foco (05 #3E4044; 40 #D7D9DE)'),
 'ij-stripe-active': ('#3871E1', '#3871E1', 'ToolWindow.Button.selectedBackground (observado ativo em 43)'),
 'ij-stripe-active-text': ('#FFFFFF', '#FFFFFF', 'ToolWindow.Button.selectedForeground'),
 # Tabs
 'ij-tab-selected': ('#233558', '#E3EBFE', 'EditorTabs.underlinedTabBackground'),
 'ij-tab-selected-border': ('#2E4D89', '#A7C5FF', 'EditorTabs.underlinedBorderColor'),
 'ij-tab-selected-inactive': ('#26282C', '#E9EAEE', 'EditorTabs.inactiveUnderlinedTabBackground'),
 'ij-tab-selected-inactive-border': ('#40434A', '#D1D3D9', 'EditorTabs.inactiveUnderlinedTabBorderColor'),
 'ij-search-tab-selected': ('#233558', '#E3EBFE', 'SearchEverywhere.Tab.selectedBackground'),
 # Controls
 'ij-field': ('#191A1C', '#FFFFFF', 'TextField.background'),
 'ij-combo': ('#26282C', '#FFFFFF', 'ComboBox.nonEditableBackground / ComboBox.background'),
 'ij-button': ('#191A1C00', '#FFFFFF00', 'Button.startBackground'),
 'ij-button-default': ('#3871E1', '#3871E1', 'Button.default.startBackground'),
 'ij-button-default-text': ('#FFFFFF', '#FFFFFF', 'Button.default.foreground'),
 'ij-tag': ('#393B40', '#EBECF0', 'List.Tag.background'),
 'ij-tag-text': ('#868A91', '#494B57', 'List.Tag.foreground'),
 'ij-counter': ('#73767C', '#8B8E94', 'Counter.background'),
 'ij-counter-text': ('#000000', '#FFFFFF', 'Counter.foreground'),
 'ij-scrollbar': ('#80808059', '#80808059', 'ScrollBar.thumbColor'),
 'ij-scrollbar-hover': ('#8080808C', '#8080808C', 'ScrollBar.hoverThumbColor'),
 'ij-progress': ('#3871E1', '#3871E1', 'ProgressBar.progressColor'),
 'ij-progress-track': ('#40434A', '#DDDFE4', 'ProgressBar.trackColor / *.disabledBorderColor (light)'),
 # Status
 'ij-error': ('#F57E84', '#C54E58', 'Label.errorForeground'),
 'ij-warning': ('#D59637', '#A56906', 'Label.warningForeground'),
 'ij-success': ('#6DB083', '#338555', 'Label.successForeground'),
 'ij-error-bg': ('#56272B', '#FFF6F5', 'ValidationTooltip.errorBackground'),
 'ij-error-border': ('#80383E', '#FFC4C5', 'ValidationTooltip.errorBorderColor'),
 'ij-warning-bg': ('#44321D', '#FFF6E9', 'ValidationTooltip.warningBackground'),
 'ij-warning-border': ('#694820', '#F4CD9A', 'ValidationTooltip.warningBorderColor'),
 'ij-success-bg': ('#203B2A', '#F5FAF3', 'Editor.ToolTip.successBackground'),
 'ij-success-border': ('#29583C', '#BBDBC2', 'Editor.ToolTip.successBorder'),
 'ij-badge-blue': ('#2F5EB9B3', '#3871E129', 'Badge.blueSecondaryBackground'),
 'ij-badge-blue-text': ('#D0DFFE', '#2F5EB9', 'Badge.blueSecondaryForeground'),
 'ij-badge-green': ('#2A6E47B3', '#33855529', 'Badge.greenSecondaryBackground'),
 'ij-badge-green-text': ('#CDE5D1', '#2A6E47', 'Badge.greenSecondaryForeground'),
 'ij-badge-purple': ('#6C4EBBB3', '#8060DB29', 'Badge.purpleSecondaryBackground'),
 'ij-badge-purple-text': ('#E2DBFC', '#6C4EBB', 'Badge.purpleSecondaryForeground'),
 'ij-trial-bg': ('#273828', '#F7F8F9', 'TrialWidget.Active.background'),
 'ij-trial-border': ('#4E8052', '#338555', 'TrialWidget.Active.borderColor'),
 'ij-trial-text': ('#5FAD65', '#338555', 'TrialWidget.Active.foreground'),
 'ij-run-icon': ('#4E9D6C', '#338555', 'RunWidget.runIconColor / Badge.greenBackground (light)'),
 'ij-stop': ('#C54E58', '#E4656E', 'RunWidget.stopBackground'),
 'ij-backdrop': ('#00000066', '#1C294C38', 'hipótese: véu de diálogo modal (não há chave pública)'),
 'ij-shadow-color': ('#00000080', '#0000002E', 'hipótese: sombra de popup'),
 'ij-breakpoint': ('#DB5C5C', '#E55757', 'hipótese: ponto de parada (CodeWithMe.Users.2.Background)'),
 'ij-gutter-blue': ('#548AF7', '#3574F0', 'observado: ícones de gutter override/implementado (05); CompilationCharts.memory.stroke'),
 'ij-gutter-green': ('#57965C', '#369650', 'observado: ícone implementa (05); ProgressBar.passedColor'),
 # VCS file status (tab and tree names)
 'ij-vcs-modified': ('#70AEFF', '#0033B3', 'FILESTATUS_MODIFIED (IslandSchemeDark.xml); claro: observado 40/43'),
 'ij-vcs-added': ('#73BD79', '#067D17', 'FILESTATUS_ADDED; claro: hipótese (DEFAULT_STRING)'),
 'ij-vcs-deleted': ('#6F737A', '#6C707E', 'FILESTATUS_DELETED; claro: BREADCRUMBS_DEFAULT'),
 'ij-vcs-conflict': ('#DE6A66', '#C54E58', 'FILESTATUS_MERGED_WITH_CONFLICTS; claro: Label.errorForeground'),
 'ij-vcs-ignored': ('#D69A6B', '#A56906', 'FILESTATUS_IDEA_FILESTATUS_IGNORED; claro: hipótese'),
 # Editor gutter / diff
 'ij-diff-added': ('#549159', '#7FC784', 'ADDED_LINES_COLOR'),
 'ij-diff-modified': ('#375FAD', '#88ADF7', 'MODIFIED_LINES_COLOR'),
 'ij-diff-deleted': ('#868A91', '#767A8A', 'DELETED_LINES_COLOR'),
 'ij-diff-added-bg': ('#549159', '#7FC784', 'ADDED_LINES_COLOR (com alpha no uso)'),
 'ij-diff-conflict': ('#DB5C5C', '#E55757', 'CodeWithMe.Users.2.Background / hipótese claro'),
 'ij-editor-bg': ('#191A1C', '#FFFFFF', 'TEXT background'),
 'ij-editor-text': ('#BCBEC4', '#080808', 'TEXT foreground'),
 'ij-editor-comment': ('#7A7E85', '#8C8C8C', 'DEFAULT_LINE_COMMENT'),
 'ij-editor-caret-row': ('#1F2024', '#F5F8FE', 'CARET_ROW_COLOR'),
 'ij-inlay': ('#727782', '#7A7A7A', 'INLAY_TEXT_WITHOUT_BACKGROUND; claro: observado 40'),
 'ij-breadcrumb': ('#9DA0A8', '#6C707E', 'BREADCRUMBS_DEFAULT'),
 'ij-breadcrumb-current': ('#DFE1E5', '#000000', 'BREADCRUMBS_CURRENT'),
 # Project avatar gradients (RecentProject.ColorN.Avatar.Start/End)
 **{f'ij-avatar-{i}-start': (s, s, f'RecentProject.Color{i}.Avatar.Start') for i, s in enumerate(['#E08855','#B08B14','#A1A359','#3B92B8','#3574F0','#C84D8F','#955AE0','#24A394','#5FAD65'], 1)},
 **{f'ij-avatar-{i}-end': (e, e, f'RecentProject.Color{i}.Avatar.End') for i, e in enumerate(['#E9806F','#BB7F19','#87AA59','#6183EC','#7A64F0','#A956CF','#A84DE0','#279CCD','#3D968B'], 1)},
 **{f'ij-avatar-{i}-toolbar': (t, l, f'RecentProject.Color{i}.MainToolbarGradientStart; claro: hipótese (cor do avatar a 22%)') for i, (t, l) in enumerate([('#664832','#E0885538'),('#5E4724','#B08B1438'),('#45522F','#A1A35938'),('#335661','#3B92B838'),('#394773','#3574F038'),('#613861','#C84D8F38'),('#503D70','#955AE038'),('#325959','#24A39438'),('#365439','#5FAD6538')], 1)},
}

# Legacy names used across the existing CSS, remapped to the semantic tokens.
LEGACY = {
 'surface': 'ij-island', 'panel': 'ij-island', 'raised': 'ij-popup', 'input': 'ij-field', 'border': 'ij-border',
 'text': 'ij-text', 'muted': 'ij-text-secondary', 'selection': 'ij-selection', 'hover': 'ij-hover',
 'success': 'ij-success', 'danger': 'ij-error', 'warning': 'ij-warning', 'info': 'ij-link',
 'success-bg': 'ij-success-bg', 'danger-bg': 'ij-error-bg', 'badge-bg': 'ij-badge-purple', 'badge-text': 'ij-badge-purple-text',
 'focus': 'ij-focus',
}
ACCENT = ('#538AF9', '#3871E1', 'Badge.blueBackground (escuro, legível como texto) / *.focusColor (claro)')
SHADOW = ('0 8px 24px #0000004D', '0 8px 24px #0000001F', 'hipótese: sombra de popup (Notification.Shadow é mais leve)')

METRICS = """ --ij-font-ui:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
 --ij-font-mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
 --ij-font-size:13px;--ij-font-size-small:12px;--ij-editor-font-size:13px;--ij-editor-line-height:22px;
 --ij-toolbar-height:40px;--ij-stripe-width:40px;--ij-stripe-button:30px;--ij-gap:5px;
 --ij-island-radius:10px;--ij-header-height:40px;--ij-tab-height:28px;--ij-tab-radius:6px;
 --ij-row-height:24px;--ij-tree-indent:18px;--ij-statusbar-height:30px;
 --ij-control-height:28px;--ij-control-radius:4px;--ij-control-radius-compact:3px;--ij-popup-radius:8px;--ij-tooltip-radius:3px;"""

def block(index):
    lines = [f'--{k}:{v[index]}' for k, v in TOKENS.items()]
    lines += [f'--{k}:var(--{v})' for k, v in LEGACY.items()]
    lines += [f'--accent:{ACCENT[index]}', f'--shadow:{SHADOW[index]}', f'--ij-shadow:{SHADOW[index]}']
    return ';'.join(lines)

FONTS = ''.join(
    f'@font-face{{font-family:"{family}";font-style:{style};font-weight:{weight};font-display:swap;src:url("./assets/fonts/{file}.woff2") format("woff2")}}\n'
    for family, style, weight, file in [
        ('Inter', 'normal', 400, 'inter-latin-400-normal'), ('Inter', 'normal', 500, 'inter-latin-500-normal'),
        ('Inter', 'normal', 600, 'inter-latin-600-normal'), ('Inter', 'normal', 700, 'inter-latin-700-normal'),
        ('JetBrains Mono', 'normal', 400, 'jetbrains-mono-latin-400-normal'), ('JetBrains Mono', 'italic', 400, 'jetbrains-mono-latin-400-italic'),
        ('JetBrains Mono', 'normal', 700, 'jetbrains-mono-latin-700-normal'), ('JetBrains Mono', 'italic', 700, 'jetbrains-mono-latin-700-italic'),
    ])

CSS = f"""/* Islands palette (recorte 28). GENERATED by scripts/islands-palette.py: edit the table there.
   Hand-written values following public Islands token values and screenshot measurements; no theme file is bundled. */
{FONTS}:root{{color-scheme:dark;{block(0)};
{METRICS}
 --left-panel:240px;--right-panel:320px;--control-padding:6px}}
:root[data-theme=light]{{color-scheme:light;{block(1)}}}
@media (prefers-color-scheme:light){{:root:not([data-theme]){{color-scheme:light;{block(1)}}}}}
html,body{{background:var(--ij-window);color:var(--ij-text);font-family:var(--ij-font-ui);font-size:var(--ij-font-size);-webkit-font-smoothing:antialiased}}
button,input,select,textarea{{accent-color:var(--ij-focus)}}
input::placeholder,textarea::placeholder{{color:var(--ij-text-info);opacity:1}}
button:disabled{{opacity:.45;cursor:default}}
:focus-visible{{outline:2px solid var(--ij-focus);outline-offset:2px}}
::selection{{background:var(--ij-selection);color:var(--ij-selection-text)}}
*{{scrollbar-color:var(--ij-scrollbar) transparent;scrollbar-width:thin}}
::-webkit-scrollbar{{width:10px;height:10px;background:transparent}}::-webkit-scrollbar-thumb{{background:var(--ij-scrollbar);border-radius:6px;border:2px solid transparent;background-clip:padding-box}}::-webkit-scrollbar-thumb:hover{{background-color:var(--ij-scrollbar-hover)}}::-webkit-scrollbar-corner{{background:transparent}}
"""

if __name__ == '__main__':
    Path(__file__).resolve().parent.parent.joinpath('src/themes.css').write_text(CSS)
    print(f'{len(TOKENS)} tokens written to src/themes.css')
