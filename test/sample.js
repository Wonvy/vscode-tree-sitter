/**
 * XML颜色装饰器 - 使用Monaco ColorProvider
 * 自动在颜色值前显示颜色小方块，支持取色器功能
 */
class XmlColorDecorator {
    constructor() {
        this.isInitialized = false;
        this.colorProvider = null;
        this.emuInlayHintsProvider = null;
        this.inlayHintsEnabled = true; // 内联提示开关状态，默认启用
        this.init();
    }


    decodePanose(hex) {
        try {
            if (!/^[0-9a-fA-F]{20}$/.test(hex)) {
                return '无效的PANOSE格式';
            }

            // 拆成 10 个字节
            const b = hex.match(/../g).map(h => parseInt(h, 16));
            const [family, serif, weight, proportion, contrast, strokeVar, armStyle, letterform, midline, xHeight] = b;

            const any = 'Any/未指定';
            const nofit = 'No fit/无适配';

            const familyMap = {
                0x00: any,
                0x01: nofit,
                0x02: 'Latin Text（西文正文字体）',
                0x03: 'Latin Hand Written（手写）',
                0x04: 'Latin Decorative（装饰）',
                0x05: 'Latin Symbol（符号）'
            };

            // 下面这些枚举仅在 family=0x02（Latin Text）时最有参考意义
            const serifMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Cove', 0x03: 'Obtuse Cove', 0x04: 'Square Cove', 0x05: 'Obtuse Square Cove',
                0x06: 'Square', 0x07: 'Thin', 0x08: 'Bone', 0x09: 'Exaggerated',
                0x0A: 'Triangle', 0x0B: 'Normal Sans', 0x0C: 'Obtuse Sans',
                0x0D: 'Perpendicular Sans', 0x0E: 'Flared', 0x0F: 'Rounded'
            };

            const weightMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Very Light', 0x03: 'Light', 0x04: 'Thin', 0x05: 'Book',
                0x06: 'Medium', 0x07: 'Demi', 0x08: 'Bold', 0x09: 'Heavy',
                0x0A: 'Black', 0x0B: 'Nord'
            };

            const proportionMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Old Style', 0x03: 'Modern', 0x04: 'Even Width', 0x05: 'Expanded',
                0x06: 'Condensed', 0x07: 'Very Expanded', 0x08: 'Very Condensed', 0x09: 'Monospaced'
            };

            const contrastMap = {
                0x00: any, 0x01: nofit,
                0x02: 'None', 0x03: 'Very Low', 0x04: 'Low', 0x05: 'Medium Low',
                0x06: 'Medium', 0x07: 'Medium High', 0x08: 'High', 0x09: 'Very High'
            };

            const strokeVarMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Gradual/Diagonal', 0x03: 'Gradual/Transitional', 0x04: 'Gradual/Vertical',
                0x05: 'Gradual/Horizontal', 0x06: 'Rapid/Vertical', 0x07: 'Rapid/Horizontal',
                0x08: 'Instant/Vertical', 0x09: 'Instant/Horizontal'
            };

            const armStyleMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Straight Arms/Horizontal', 0x03: 'Straight Arms/Wedge',
                0x04: 'Straight Arms/Vertical', 0x05: 'Straight Arms/Single Serif',
                0x06: 'Straight Arms/Double Serif', 0x07: 'Non-Straight Arms/Horizontal',
                0x08: 'Non-Straight Arms/Wedge', 0x09: 'Non-Straight Arms/Vertical',
                0x0A: 'Non-Straight Arms/Single Serif', 0x0B: 'Non-Straight Arms/Double Serif'
            };

            const letterformMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Normal/Contact', 0x03: 'Normal/Weighted', 0x04: 'Normal/Boxed',
                0x05: 'Normal/Flattened', 0x06: 'Normal/Rounded', 0x07: 'Normal/Off-Center',
                0x08: 'Normal/Square', 0x09: 'Oblique/Contact', 0x0A: 'Oblique/Weighted',
                0x0B: 'Oblique/Boxed', 0x0C: 'Oblique/Flattened', 0x0D: 'Oblique/Rounded',
                0x0E: 'Oblique/Off-Center', 0x0F: 'Oblique/Square'
            };

            const midlineMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Standard/Trimmed', 0x03: 'Standard/Pointed', 0x04: 'Standard/Serifed',
                0x05: 'High/Trimmed', 0x06: 'High/Pointed', 0x07: 'High/Serifed',
                0x08: 'Constant/Trimmed', 0x09: 'Constant/Pointed', 0x0A: 'Constant/Serifed',
                0x0B: 'Low/Trimmed', 0x0C: 'Low/Pointed', 0x0D: 'Low/Serifed'
            };

            const xHeightMap = {
                0x00: any, 0x01: nofit,
                0x02: 'Constant/Small', 0x03: 'Constant/Standard', 0x04: 'Constant/Large',
                0x05: 'Ducking/Small', 0x06: 'Ducking/Standard', 0x07: 'Ducking/Large'
            };

            const pick = (map, v) => (map[v] ?? `未定义(0x${v.toString(16).toUpperCase()})`);

            const result = {
                rawBytes: b.map(v => '0x' + v.toString(16).padStart(2, '0')),
                familyType: pick(familyMap, family),
                serifStyle: pick(serifMap, serif),
                weight: pick(weightMap, weight),
                proportion: pick(proportionMap, proportion),
                contrast: pick(contrastMap, contrast),
                strokeVariation: pick(strokeVarMap, strokeVar),
                armStyle: pick(armStyleMap, armStyle),
                letterform: pick(letterformMap, letterform),
                midline: pick(midlineMap, midline),
                xHeight: pick(xHeightMap, xHeight),
                note: family === 0x02 ? '按 Latin Text 解释' : '非 Latin Text：后续字段含义可能不同，仅作参考'
            };

            // 返回简化的显示信息
            return `${result.familyType} | ${result.weight} | ${result.proportion}`;

        } catch (error) {
            console.warn('PANOSE解码失败:', error);
            return 'PANOSE解码失败';
        }
    }

    /**
     * 初始化颜色装饰器
     */
    async init() {
        try {
            // console.log('🎨 XML颜色装饰器开始初始化...');

            // 等待Monaco Editor加载完成
            await this.waitForMonacoEditor();

            // 注册ColorProvider
            this.registerColorProvider();

            this.isInitialized = true;
            // console.log('✅ XML颜色装饰器初始化完成');

        } catch (error) {
            console.error('❌ XML颜色装饰器初始化失败:', error);
        }
    }

    /**
     * 等待Monaco Editor加载完成
     */
    async waitForMonacoEditor() {
        return new Promise((resolve) => {
            const checkMonaco = () => {
                if (window.monaco && window.monaco.editor && window.monaco.languages) {
                    resolve();
                } else {
                    setTimeout(checkMonaco, 100);
                }
            };
            checkMonaco();
        });
    }

    /**
     * 注册ColorProvider
     */
    registerColorProvider() {
        try {
            // // console.log('🔧 开始注册XML和JSON ColorProvider...');

            // 检查Monaco Editor状态
            if (!window.monaco) {
                console.error('❌ window.monaco未定义');
                return;
            }

            if (!window.monaco.languages) {
                console.error('❌ window.monaco.languages未定义');
                return;
            }

            if (!window.monaco.languages.registerColorProvider) {
                console.error('❌ window.monaco.languages.registerColorProvider未定义');
                return;
            }

            // console.log('✅ Monaco Editor API检查通过');

            // 如果已经注册了ColorProvider，先销毁
            if (this.colorProvider) {
                try {
                    // console.log('🗑️ 销毁现有ColorProvider...');
                    this.colorProvider.dispose();
                    this.colorProvider = null;
                    // console.log('✅ 现有ColorProvider已销毁');
                } catch (error) {
                    console.warn('⚠️ 销毁现有ColorProvider失败:', error);
                }
            }

            // 注册XML语言的ColorProvider
            // console.log('📝 注册XML ColorProvider...');
            const xmlColorProvider = monaco.languages.registerColorProvider('xml', {
                provideDocumentColors: (model) => {
                    return this.provideDocumentColors(model);
                },
                provideColorPresentations: (model, colorInfo, provider) => {
                    return this.provideColorPresentations(model, colorInfo, provider);
                }
            });

            // 注册JSON语言的ColorProvider
            // console.log('📝 注册JSON ColorProvider...');
            const jsonColorProvider = monaco.languages.registerColorProvider('json', {
                provideDocumentColors: (model) => {
                    return this.provideJsonDocumentColors(model);
                },
                provideColorPresentations: (model, colorInfo, provider) => {
                    return this.provideColorPresentations(model, colorInfo, provider);
                }
            });

            // 保存两个ColorProvider的引用
            this.colorProvider = {
                xml: xmlColorProvider,
                json: jsonColorProvider,
                dispose: () => {
                    xmlColorProvider.dispose();
                    jsonColorProvider.dispose();
                }
            };

            // console.log('✅ XML和JSON ColorProvider注册成功:', this.colorProvider);

            // 验证注册是否成功
            if (this.colorProvider.xml && this.colorProvider.json &&
                typeof this.colorProvider.dispose === 'function') {
                // console.log('✅ ColorProvider注册验证通过');
            } else {
                console.warn('⚠️ ColorProvider注册验证失败:', this.colorProvider);
            }

            // 注册EMU数值内联提示提供器
            this.registerEmuInlayHintsProvider();

            // 注册右键菜单
            this.registerContextMenu();

        } catch (error) {
            console.error('❌ 注册ColorProvider失败:', error);
            console.error('错误堆栈:', error.stack);
        }
    }

    /**
     * 注册右键菜单
     */
    registerContextMenu() {
        try {
            // console.log('🔧 开始注册右键菜单...');

            // 检查Monaco Editor状态
            if (!window.monaco) {
                console.error('❌ window.monaco未定义');
                return;
            }

            if (!window.monaco.editor) {
                console.error('❌ window.monaco.editor未定义');
                return;
            }

            if (!window.monaco.editor.addEditorAction) {
                console.error('❌ window.monaco.editor.addEditorAction未定义');
                return;
            }

            // console.log('✅ Monaco Editor Action API检查通过');

            // 注册内联提示开关动作
            const toggleInlayHintsAction = {
                id: 'toggle-inlay-hints',
                label: '内联提示',
                contextMenuGroupId: '1_modification',
                contextMenuOrder: 1.5,
                run: (editor) => {
                    this.toggleInlayHints(editor);
                }
            };

            // 注册动作
            window.monaco.editor.addEditorAction(toggleInlayHintsAction);

            // console.log('✅ 右键菜单动作注册成功');

        } catch (error) {
            console.error('❌ 注册右键菜单失败:', error);
            console.error('错误堆栈:', error.stack);
        }
    }

    /**
     * 切换内联提示状态
     */
    toggleInlayHints(editor) {
        try {
            this.inlayHintsEnabled = !this.inlayHintsEnabled;

            // 更新编辑器选项
            editor.updateOptions({
                inlayHints: { enabled: this.inlayHintsEnabled ? 'on' : 'off' }
            });

            // console.log(`✅ 内联提示已${this.inlayHintsEnabled ? '启用' : '禁用'}`);

            // 显示状态提示
            this.showStatusMessage(editor, `内联提示已${this.inlayHintsEnabled ? '启用' : '禁用'}`);

        } catch (error) {
            console.error('❌ 切换内联提示状态失败:', error);
        }
    }

    /**
     * 显示状态消息
     */
    showStatusMessage(editor, message) {
        try {
            // 使用Monaco Editor的showMessage方法显示状态
            if (editor.getAction && editor.getAction('editor.action.showContextMenu')) {
                // 如果编辑器支持状态栏消息，显示在那里
                // console.log(`💬 ${message}`);
            } else {
                // 否则在控制台显示
                // console.log(`💬 ${message}`);
            }
        } catch (error) {
            console.log(`💬 ${message}`);
        }
    }

    /**
     * 注册EMU数值内联提示提供器
     */
    registerEmuInlayHintsProvider() {
        try {
            console.log('🔧 开始注册EMU数值内联提示提供器...');

            // 检查Monaco Editor状态
            if (!window.monaco) {
                console.error('❌ window.monaco未定义');
                return;
            }

            if (!window.monaco.languages) {
                console.error('❌ window.monaco.languages未定义');
                return;
            }

            if (!window.monaco.languages.registerInlayHintsProvider) {
                console.error('❌ window.monaco.languages.registerInlayHintsProvider未定义');
                return;
            }

            console.log('✅ Monaco Editor InlayHints API检查通过');

            // 如果已经注册了InlayHintsProvider，先销毁
            if (this.emuInlayHintsProvider) {
                try {
                    // console.log('🗑️ 销毁现有EMU InlayHintsProvider...');
                    this.emuInlayHintsProvider.dispose();
                    this.emuInlayHintsProvider = null;
                    // console.log('✅ 现有EMU InlayHintsProvider已销毁');
                } catch (error) {
                    console.warn('⚠️ 销毁现有EMU InlayHintsProvider失败:', error);
                }
            }

            // 注册XML语言的EMU数值内联提示提供器
            console.log('📝 注册XML EMU InlayHintsProvider...');
            this.emuInlayHintsProvider = monaco.languages.registerInlayHintsProvider('xml', {
                provideInlayHints: (model, range) => {
                    return this.provideEmuInlayHints(model, range);
                }
            });

            // console.log('✅ XML EMU InlayHintsProvider注册成功:', this.emuInlayHintsProvider);

            // 验证注册是否成功
            if (this.emuInlayHintsProvider && typeof this.emuInlayHintsProvider.dispose === 'function') {
                // console.log('✅ EMU InlayHintsProvider注册验证通过');
            } else {
                console.warn('⚠️ EMU InlayHintsProvider注册验证失败:', this.emuInlayHintsProvider);
            }

        } catch (error) {
            console.error('❌ 注册EMU InlayHintsProvider失败:', error);
            console.error('错误堆栈:', error.stack);
        }
    }

    /**
     * 提供EMU数值内联提示
     */
    provideEmuInlayHints(model, range) {
        try {
            // 检查内联提示是否启用
            if (!this.inlayHintsEnabled) {
                // console.log('📏 内联提示已禁用，不显示任何提示');
                return { hints: [], dispose() { } };
            }


            const text = model.getValueInRange(range);
            const baseOffset = model.getOffsetAt({
                lineNumber: range.startLineNumber,
                column: range.startColumn
            });
            const hints = [];

            // EMU到厘米的转换常量
            const EMU_PER_CM = 360000;
            const toCm = (n) => (n / EMU_PER_CM).toFixed(2) + ' cm';

            // 角度转换常量（1度 = 60000单位）
            const UNITS_PER_DEGREE = 60000;
            const toDegrees = (n) => (n / UNITS_PER_DEGREE).toFixed(1) + '°';

            // 字体大小转换常量（1磅 = 100单位）
            const EMU_PER_POINT = 100;
            const toPoints = (n) => (n / EMU_PER_POINT).toFixed(0) + 'pt';

            // bodyPr属性转换常量
            const toBodyPrValue = (attrName, value) => {
                const num = Number(value);
                switch (attrName) {
                    case 'rot': // 旋转角度（度）
                        return (num / 60000).toFixed(1) + '°';
                    case 'lIns': // 左边距（EMU转厘米）
                    case 'tIns': // 上边距（EMU转厘米）
                    case 'rIns': // 右边距（EMU转厘米）
                    case 'bIns': // 下边距（EMU转厘米）
                        return (num / 360000).toFixed(2) + ' cm';
                    case 'numCol': // 列数（直接显示）
                        return num + ' 列';
                    case 'spcCol': // 列间距（EMU转厘米）
                        return (num / 360000).toFixed(2) + ' cm';
                    default:
                        return value;
                }
            };

            // 匹配常见的EMU数值属性：x, y, cx, cy, w, h
            const RE_NUM = /\b(?:x|y|cx|cy|w|h)\s*=\s*"(\d+)"/g;
            let match;

            while ((match = RE_NUM.exec(text)) !== null) {
                const numStr = match[1];
                const attributeName = match[0].match(/\b(?:x|y|cx|cy|w|h)\s*=/)[0].replace(/\s*=\s*/, '');
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const cmValue = toCm(n);

                // console.log(`📏 找到EMU数值: ${attributeName}="${numStr}" -> ${cmValue}`);

                hints.push({
                    position: pos,
                    label: cmValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `${numStr} EMU ≈ ${cmValue} (${attributeName}属性)`,
                    whitespaceAfter: true
                });
            }

            // 匹配角度值：ang属性（1度 = 60000单位）
            const RE_ANG = /\bang\s*=\s*"(\d+)"/g;

            while ((match = RE_ANG.exec(text)) !== null) {
                const numStr = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const degreeValue = toDegrees(n);

                // console.log(`🔄 找到角度值: ang="${numStr}" -> ${degreeValue}`);

                hints.push({
                    position: pos,
                    label: degreeValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `ang=${degreeValue} "${numStr}" (角度值)`,
                    whitespaceAfter: true
                });
            }

            // 匹配字体大小值：sz属性（1磅 = 12700 EMU）
            const RE_SZ = /\bsz\s*=\s*"(\d+)"/g;

            while ((match = RE_SZ.exec(text)) !== null) {
                const numStr = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const pointValue = toPoints(n);

                // console.log(`🔤 找到字体大小值: sz="${numStr}" -> ${pointValue}`);

                hints.push({
                    position: pos,
                    label: pointValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `sz=${pointValue} "${numStr}" (字体大小)`,
                    whitespaceAfter: true
                });
            }

            // 匹配PANOSE字体分类值：panose属性（20位十六进制字符串）
            const RE_PANOSE = /\bpanose\s*=\s*"([0-9a-fA-F]{20})"/g;

            while ((match = RE_PANOSE.exec(text)) !== null) {
                const panoseValue = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(panoseValue);
                const pos = model.getPositionAt(absStart);
                const decodedInfo = this.decodePanose(panoseValue);

                // console.log(`🔤 找到PANOSE值: panose="${panoseValue}" -> ${decodedInfo}`);

                hints.push({
                    position: pos,
                    label: decodedInfo,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `panose="${panoseValue}"\n${decodedInfo}`,
                    whitespaceAfter: true
                });
            }

            // 匹配bodyPr标签中的属性值
            const RE_BODYPR = /\b(?:rot|lIns|tIns|rIns|bIns|numCol|spcCol)\s*=\s*"(\d+)"/g;

            while ((match = RE_BODYPR.exec(text)) !== null) {
                const numStr = match[1];
                const attributeName = match[0].match(/\b(?:rot|lIns|tIns|rIns|bIns|numCol|spcCol)\s*=/)[0].replace(/\s*=\s*/, '');
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const convertedValue = toBodyPrValue(attributeName, numStr);

                // console.log(`📝 找到bodyPr属性: ${attributeName}="${numStr}" -> ${convertedValue}`);

                hints.push({
                    position: pos,
                    label: convertedValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `${attributeName}="${numStr}" → ${convertedValue}`,
                    whitespaceAfter: true
                });
            }

            // 匹配几何定义列表中的数值：gdLst中的fmla属性
            const RE_GDLST = /\bfmla="[^"]*?(\d+)[^"]*?"/g;

            while ((match = RE_GDLST.exec(text)) !== null) {
                const numStr = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const cmValue = toCm(n);

                // console.log(`🔢 找到几何定义数值: ${numStr} -> ${cmValue}`);

                hints.push({
                    position: pos,
                    label: cmValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `${numStr} EMU ≈ ${cmValue} (几何定义)`,
                    whitespaceAfter: true
                });
            }

            // 匹配渐变位置值：pos属性（0-100000，表示0%-100%）
            const RE_POS = /\bpos\s*=\s*"(\d+)"/g;

            while ((match = RE_POS.exec(text)) !== null) {
                const numStr = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const percentValue = this.toPercent(n);

                // console.log(`📊 找到渐变位置值: pos="${numStr}" -> ${percentValue}`);

                hints.push({
                    position: pos,
                    label: percentValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `pos=${percentValue} "${numStr}" (渐变位置)`,
                    whitespaceAfter: true
                });
            }

            // 匹配亮度调节值：lumMod和lumOff属性（0-100000，表示0%-100%）
            const RE_LUM = /\b(?:lumMod|lumOff)\s*val\s*=\s*"(\d+)"/g;

            while ((match = RE_LUM.exec(text)) !== null) {
                const numStr = match[1];
                const attributeName = match[0].match(/\b(?:lumMod|lumOff)\s*val\s*=/)[0].replace(/\s*val\s*=\s*/, '');
                const absStart = baseOffset + match.index + match[0].indexOf(numStr);
                const pos = model.getPositionAt(absStart);
                const n = Number(numStr);
                const percentValue = this.toPercent(n);

                // console.log(`💡 找到亮度调节值: ${attributeName} val="${numStr}" -> ${percentValue}`);

                hints.push({
                    position: pos,
                    label: percentValue,
                    kind: monaco.languages.InlayHintKind.Type,
                    paddingRight: true,
                    tooltip: `${attributeName} val=${percentValue} "${numStr}" (亮度调节)`,
                    whitespaceAfter: true
                });
            }

            // 匹配r:embed属性中的图片ID
            const RE_R_EMBED = /\br:embed\s*=\s*"([^"]+)"/g;

            while ((match = RE_R_EMBED.exec(text)) !== null) {
                const relationshipId = match[1];
                const absStart = baseOffset + match.index + match[0].indexOf(relationshipId);
                const pos = model.getPositionAt(absStart);

                // 尝试从当前文件的.rels文件获取图片路径
                let imagePath = null;

                // 尝试从model.uri获取文件路径信息
                if (model.uri) {
                    // Monaco Editor的URI格式可能是: file:///path/to/file 或 inmemory://model/...
                    let filePath = '';

                    if (model.uri.scheme === 'file') {
                        // 文件系统路径
                        filePath = model.uri.fsPath || model.uri.path;
                    } else if (model.uri.scheme === 'inmemory') {
                        // 内存中的模型，尝试从其他方式获取路径
                        filePath = model.uri.path || '';
                    }

                    if (filePath) {
                        imagePath = this.getImagePathFromRels(filePath, relationshipId);
                    }
                }

                // 如果无法从URI获取，尝试从localStorage中查找当前编辑的文件信息
                if (!imagePath) {
                    // 尝试从localStorage获取当前编辑的文件信息
                    const currentFileKey = 'currentEditingFile';
                    const currentFileInfo = localStorage.getItem(currentFileKey);

                    if (currentFileInfo) {
                        try {
                            const fileInfo = JSON.parse(currentFileInfo);
                            if (fileInfo.folder && fileInfo.fileName) {
                                imagePath = this.getImagePathFromRels(fileInfo.folder + '/' + fileInfo.fileName, relationshipId);
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }

                if (imagePath) {
                    hints.push({
                        position: pos,
                        label: imagePath,
                        kind: monaco.languages.InlayHintKind.Type,
                        paddingRight: true,
                        tooltip: `r:embed="${relationshipId}"\n图片路径: ${imagePath}`,
                        whitespaceAfter: true
                    });
                } else {
                    hints.push({
                        position: pos,
                        label: `r:embed="${relationshipId}" (未找到图片)`,
                        kind: monaco.languages.InlayHintKind.Type,
                        paddingRight: true,
                        tooltip: `r:embed="${relationshipId}" (未找到图片)\n请确保.rels文件已加载到localStorage中`,
                        whitespaceAfter: true
                    });
                }
            }

            // console.log(`📏 总共找到 ${hints.length} 个内联提示`);

            return {
                hints,
                dispose() { }
            };

        } catch (error) {
            console.error('❌ 提供EMU内联提示失败:', error);
            return { hints: [], dispose() { } };
        }
    }

    /**
     * 将渐变位置值转换为百分比
     */
    toPercent(value) {
        // 渐变位置值范围：0-100000，对应0%-100%
        const MAX_POS = 100000;
        const percent = (value / MAX_POS * 100).toFixed(1);
        return `${percent}%`;
    }

    /**
     * 提供文档中的所有颜色
     */
    provideDocumentColors(model) {
        try {
            // console.log('🎨 ColorProvider.provideDocumentColors被调用');

            const content = model.getValue();
            const colors = [];

            // 查找所有srgbClr标签中的颜色值
            const srgbPattern = /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"[^>]*\/?>/g;
            let match;

            while ((match = srgbPattern.exec(content)) !== null) {
                const colorValue = match[1];
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                // 找到颜色值在标签中的具体位置
                const tagContent = match[0];
                const valStart = tagContent.indexOf(`val="${colorValue}"`);
                if (valStart !== -1) {
                    const colorStart = matchStart + valStart + 5; // "val=" 的长度是5
                    const colorEnd = colorStart + colorValue.length;

                    const startPos = model.getPositionAt(colorStart);
                    const endPos = model.getPositionAt(colorEnd);

                    // console.log(`🎨 找到srgbClr颜色: #${colorValue} 在位置 ${colorStart}-${colorEnd} (行${startPos.lineNumber}, 列${startPos.column}-${endPos.column})`);

                    colors.push({
                        color: {
                            red: parseInt(colorValue.substring(0, 2), 16) / 255,
                            green: parseInt(colorValue.substring(2, 4), 16) / 255,
                            blue: parseInt(colorValue.substring(4, 6), 16) / 255,
                            alpha: 1
                        },
                        range: new monaco.Range(
                            startPos.lineNumber,
                            startPos.column,
                            endPos.lineNumber,
                            endPos.column
                        )
                    });
                }
            }

            // 查找所有sysClr标签中的lastClr颜色值
            const sysClrPattern = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"[^>]*\/?>/g;

            while ((match = sysClrPattern.exec(content)) !== null) {
                const colorValue = match[1];
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                // 找到lastClr值在标签中的具体位置
                const tagContent = match[0];
                const lastClrStart = tagContent.indexOf(`lastClr="${colorValue}"`);
                if (lastClrStart !== -1) {
                    const colorStart = matchStart + lastClrStart + 9; // "lastClr=" 的长度是9
                    const colorEnd = colorStart + colorValue.length;

                    const startPos = model.getPositionAt(colorStart);
                    const endPos = model.getPositionAt(colorEnd);

                    // console.log(`🎨 找到sysClr lastClr颜色: #${colorValue} 在位置 ${colorStart}-${colorEnd} (行${startPos.lineNumber}, 列${startPos.column}-${endPos.column})`);

                    colors.push({
                        color: {
                            red: parseInt(colorValue.substring(0, 2), 16) / 255,
                            green: parseInt(colorValue.substring(2, 4), 16) / 255,
                            blue: parseInt(colorValue.substring(4, 6), 16) / 255,
                            alpha: 1
                        },
                        range: new monaco.Range(
                            startPos.lineNumber,
                            startPos.column,
                            endPos.lineNumber,
                            endPos.column
                        )
                    });
                }
            }

            // 查找所有主题色引用（如accent1、accent2、dk1、lt1等）
            const schemeClrPattern = /<a:schemeClr\s+val="([a-zA-Z0-9]+)"[^>]*\/?>/g;

            while ((match = schemeClrPattern.exec(content)) !== null) {
                const themeColorName = match[1];
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                // 检查是否是有效的主题色名称
                if (this.isValidThemeColorName(themeColorName)) {
                    // 尝试从浏览器数据中获取主题色值
                    const themeColorHex = this.getThemeColorValue(themeColorName);

                    if (themeColorHex) {
                        // 找到主题色名称在标签中的具体位置
                        const tagContent = match[0];
                        const valStart = tagContent.indexOf(`val="${themeColorName}"`);
                        if (valStart !== -1) {
                            const colorStart = matchStart + valStart + 5; // "val=" 的长度是5
                            const colorEnd = colorStart + themeColorName.length;

                            const startPos = model.getPositionAt(colorStart);
                            const endPos = model.getPositionAt(colorEnd);

                            // console.log(`🎨 找到主题色引用: ${themeColorName} = ${themeColorHex} 在位置 ${colorStart}-${colorEnd} (行${startPos.lineNumber}, 列${startPos.column}-${endPos.column})`);

                            // 转换HEX颜色为RGB
                            const hexColor = themeColorHex.startsWith('#') ? themeColorHex.substring(1) : themeColorHex;
                            const red = parseInt(hexColor.substring(0, 2), 16) / 255;
                            const green = parseInt(hexColor.substring(2, 4), 16) / 255;
                            const blue = parseInt(hexColor.substring(4, 6), 16) / 255;

                            colors.push({
                                color: {
                                    red: red,
                                    green: green,
                                    blue: blue,
                                    alpha: 1
                                },
                                range: new monaco.Range(
                                    startPos.lineNumber,
                                    startPos.column,
                                    endPos.lineNumber,
                                    endPos.column
                                ),
                                // 添加主题色信息，用于在颜色表示中显示
                                themeColorName: themeColorName,
                                themeColorHex: themeColorHex
                            });
                        }
                    } else {
                        // console.log(`ℹ️ 主题色引用 ${themeColorName} 未找到对应的颜色值`);
                    }
                }
            }

            // console.log(`🎨 总共找到 ${colors.length} 个颜色`);
            return colors;

        } catch (error) {
            console.error('❌ 提供文档颜色失败:', error);
            return [];
        }
    }

    /**
     * 提供JSON文档中的所有颜色
     */
    provideJsonDocumentColors(model) {
        try {
            // console.log('🎨 ColorProvider.provideJsonDocumentColors被调用');
            const content = model.getValue();
            const colors = [];

            // 查找所有hex字段中的颜色值 - 只匹配颜色值部分
            const hexPattern = /"hex":\s*"#([0-9A-Fa-f]{6})"/g;
            let match;
            while ((match = hexPattern.exec(content)) !== null) {
                const colorValue = match[1];
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                // 找到颜色值在字段中的具体位置（只匹配#后面的6位颜色值）
                const fieldContent = match[0];
                const colorStart = matchStart + fieldContent.indexOf('#' + colorValue);
                const colorEnd = colorStart + colorValue.length + 1; // +1 包含#号

                const startPos = model.getPositionAt(colorStart);
                const endPos = model.getPositionAt(colorEnd);

                // console.log(`🎨 找到JSON hex颜色: #${colorValue} 在位置 ${colorStart}-${colorEnd} (行${startPos.lineNumber}, 列${startPos.column}-${endPos.column})`);

                colors.push({
                    color: {
                        red: parseInt(colorValue.substring(0, 2), 16) / 255,
                        green: parseInt(colorValue.substring(2, 4), 16) / 255,
                        blue: parseInt(colorValue.substring(4, 6), 16) / 255,
                        alpha: 1
                    },
                    range: new monaco.Range(
                        startPos.lineNumber,
                        startPos.column,
                        endPos.lineNumber,
                        endPos.column
                    )
                });
            }

            // 查找所有value字段中的颜色值 - 只匹配颜色值部分
            const valuePattern = /"value":\s*"([0-9A-Fa-f]{6})"/g;
            while ((match = valuePattern.exec(content)) !== null) {
                const colorValue = match[1];
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                // 找到颜色值在字段中的具体位置（只匹配6位颜色值，不包含引号）
                const fieldContent = match[0];
                const colorStart = matchStart + fieldContent.indexOf('"' + colorValue + '"') + 1; // +1 跳过开始引号
                const colorEnd = colorStart + colorValue.length;

                const startPos = model.getPositionAt(colorStart);
                const endPos = model.getPositionAt(colorEnd);

                // console.log(`🎨 找到JSON value颜色: ${colorValue} 在位置 ${colorStart}-${colorEnd} (行${startPos.lineNumber}, 列${startPos.column}-${endPos.column})`);

                colors.push({
                    color: {
                        red: parseInt(colorValue.substring(0, 2), 16) / 255,
                        green: parseInt(colorValue.substring(2, 4), 16) / 255,
                        blue: parseInt(colorValue.substring(4, 6), 16) / 255,
                        alpha: 1
                    },
                    range: new monaco.Range(
                        startPos.lineNumber,
                        startPos.column,
                        endPos.lineNumber,
                        endPos.column
                    )
                });
            }

            // console.log(`🎨 总共找到 ${colors.length} 个颜色`);
            return colors;
        } catch (error) {
            console.error('❌ 提供JSON文档颜色失败:', error);
            return [];
        }
    }

    /**
     * 提供颜色表示形式
     */
    provideColorPresentations(model, colorInfo, provider) {
        try {
            // console.log('🎨 ColorProvider.provideColorPresentations被调用:', colorInfo);

            const red = Math.round(colorInfo.color.red * 255);
            const green = Math.round(colorInfo.color.green * 255);
            const blue = Math.round(colorInfo.color.blue * 255);
            const hexColor = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`.toUpperCase();

            // console.log(`🎨 颜色表示: RGB(${red}, ${green}, ${blue}) = ${hexColor}`);

            // 检查当前编辑器的语言
            const language = model.getLanguageId();

            if (language === 'json') {
                // JSON编辑器：返回带#的完整颜色值
                return [
                    {
                        label: hexColor,
                        textEdit: {
                            range: colorInfo.range,
                            text: hexColor // 包含#号
                        }
                    }
                ];
            } else {
                // XML编辑器：处理不同类型的颜色
                if (colorInfo.themeColorName && colorInfo.themeColorHex) {
                    // 主题色引用：显示主题色名称和颜色值
                    return [
                        {
                            label: `${colorInfo.themeColorName} (${colorInfo.themeColorHex})`,
                            textEdit: {
                                range: colorInfo.range,
                                text: colorInfo.themeColorName // 保持主题色名称不变
                            }
                        },
                        {
                            label: `替换为颜色值: ${colorInfo.themeColorHex}`,
                            textEdit: {
                                range: colorInfo.range,
                                text: colorInfo.themeColorHex.substring(1) // 去掉#号
                            }
                        }
                    ];
                } else {
                    // 普通颜色值：返回不带#的颜色值
                    return [
                        {
                            label: hexColor,
                            textEdit: {
                                range: colorInfo.range,
                                text: hexColor.substring(1) // 去掉#号，只返回颜色值
                            }
                        }
                    ];
                }
            }

        } catch (error) {
            console.error('❌ 提供颜色表示失败:', error);
            return [];
        }
    }

    /**
     * 验证主题色名称是否有效
     */
    isValidThemeColorName(name) {
        const validThemeColors = [
            'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
            'dk1', 'dk2', 'lt1', 'lt2', 'bg1', 'bg2', 'tx1', 'tx2',
            'hlink', 'folHlink'
        ];
        return validThemeColors.includes(name);
    }

    /**
     * 从浏览器数据中获取主题色值
     */
    getThemeColorValue(themeColorName) {
        try {
            // console.log(`🔍 尝试获取主题色 ${themeColorName} 的值...`);

            // 方法1：从localStorage的powerpointDocumentInfo中获取（主要数据源）
            const localStorageKey = 'powerpointDocumentInfo';
            const storedData = localStorage.getItem(localStorageKey);

            if (storedData) {
                try {
                    const documentInfo = JSON.parse(storedData);
                    // console.log('✅ 从localStorage获取到powerpointDocumentInfo:', documentInfo);

                    // 检查主题色数据结构
                    if (documentInfo.themeColors) {
                        // console.log('🎨 找到themeColors节点:', documentInfo.themeColors);

                        // 尝试不同的主题色数据结构
                        let themeColor = null;

                        // 结构1: themeColors.scheme
                        if (documentInfo.themeColors.scheme) {
                            themeColor = documentInfo.themeColors.scheme[themeColorName];
                            if (themeColor) {
                                // console.log(`✅ 从themeColors.scheme中找到主题色 ${themeColorName}:`, themeColor);
                                return themeColor;
                            }
                        }

                        // 结构2: themeColors直接包含主题色
                        if (documentInfo.themeColors[themeColorName]) {
                            themeColor = documentInfo.themeColors[themeColorName];
                            // console.log(`✅ 从themeColors直接找到主题色 ${themeColorName}:`, themeColor);
                            return themeColor;
                        }

                        // 结构3: 检查是否有其他可能的结构
                        // console.log('🔍 检查themeColors的其他可能结构...');
                        Object.keys(documentInfo.themeColors).forEach(key => {
                            // console.log(`  - ${key}:`, documentInfo.themeColors[key]);
                        });

                    } else {
                        // console.log('ℹ️ powerpointDocumentInfo中没有themeColors节点');
                        // console.log('可用的顶级节点:', Object.keys(documentInfo));
                    }

                } catch (parseError) {
                    console.warn('❌ 解析localStorage中的powerpointDocumentInfo失败:', parseError);
                    // console.log('原始数据:', storedData);
                }
            } else {
                // console.log('ℹ️ localStorage中没有找到powerpointDocumentInfo');

                // 列出localStorage中所有可用的键
                const allKeys = Object.keys(localStorage);
                // console.log('localStorage中可用的键:', allKeys);

                // 查找可能包含主题色信息的键
                const possibleKeys = allKeys.filter(key =>
                    key.toLowerCase().includes('theme') ||
                    key.toLowerCase().includes('color') ||
                    key.toLowerCase().includes('powerpoint') ||
                    key.toLowerCase().includes('document')
                );

                if (possibleKeys.length > 0) {
                    // console.log('🔍 可能包含主题色信息的键:', possibleKeys);
                    possibleKeys.forEach(key => {
                        try {
                            const data = localStorage.getItem(key);
                            if (data && data.includes('accent1')) {
                                // console.log(`🎯 键 ${key} 可能包含主题色信息:`, data.substring(0, 200) + '...');
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    });
                }
            }

            // 方法2：从documentInfoExtractor中获取
            if (window.documentInfoExtractor && window.documentInfoExtractor.documentInfo) {
                // console.log('🔍 尝试从documentInfoExtractor获取主题色...');
                if (window.documentInfoExtractor.documentInfo.themeColors &&
                    window.documentInfoExtractor.documentInfo.themeColors.scheme) {
                    const themeColor = window.documentInfoExtractor.documentInfo.themeColors.scheme[themeColorName];
                    if (themeColor) {
                        // console.log(`✅ 从documentInfoExtractor中找到主题色 ${themeColorName}:`, themeColor);
                        return themeColor;
                    }
                }
            }

            // 方法3：从其他可能的位置获取
            if (window.themeColors && window.themeColors[themeColorName]) {
                const themeColor = window.themeColors[themeColorName];
                // console.log(`✅ 从window.themeColors中找到主题色 ${themeColorName}:`, themeColor);
                return themeColor;
            }

            // 方法4：使用默认主题色映射（备用方案）
            const defaultThemeColors = {
                'accent1': '#C00000', // 强调色1 - 红色
                'accent2': '#00B050', // 强调色2 - 绿色
                'accent3': '#A5A5A5', // 强调色3 - 灰色
                'accent4': '#FFC000', // 强调色4 - 黄色
                'accent5': '#5B9BD5', // 强调色5 - 蓝色
                'accent6': '#70AD47', // 强调色6 - 绿色
                'dk1': '#000000',     // 深色1 - 黑色
                'dk2': '#44546A',     // 深色2 - 深蓝灰
                'lt1': '#FFFFFF',     // 浅色1 - 白色
                'lt2': '#E7E6E6',     // 浅色2 - 浅灰
                'bg1': '#FFFFFF',     // 背景1 - 白色
                'bg2': '#F2F2F2',     // 背景2 - 浅灰
                'tx1': '#000000',     // 主要文本色 - 黑色
                'tx2': '#44546A',     // 次要文本色 - 深蓝灰
                'hlink': '#0563C1',   // 超链接色 - 蓝色
                'folHlink': '#954F72' // 已访问超链接色 - 紫色
            };

            if (defaultThemeColors[themeColorName]) {
                // console.log(`ℹ️ 使用默认主题色 ${themeColorName}:`, defaultThemeColors[themeColorName]);
                return defaultThemeColors[themeColorName];
            }

            // console.log(`❌ 未找到主题色 ${themeColorName} 的值`);
            return null;

        } catch (error) {
            console.error(`❌ 获取主题色 ${themeColorName} 失败:`, error);
            return null;
        }
    }

    /**
     * 通过.rels文件获取图片相对地址
     * @param {string} filePath - 当前文件的绝对路径
     * @param {string} relationshipId - 关系ID（如：rId3）
     * @returns {string|null} 图片相对地址，如果未找到则返回null
     */
    getImagePathFromRels(filePath, relationshipId) {
        try {
            // 从文件路径中提取文件夹和文件名
            const parsedPath = this.parseFilePath(filePath);
            const currentFolder = parsedPath.folder;
            const currentFileName = parsedPath.fileName;

            if (!currentFolder || !currentFileName) {
                console.warn('❌ 无法从文件路径中提取文件夹或文件名:', filePath);
                return null;
            }

            // console.log(`🔍 查找图片路径: 文件夹=${currentFolder}, 文件=${currentFileName}, ID=${relationshipId}`);

            // 构建.rels文件路径
            // 假设.rels文件位于当前文件夹的_rels子文件夹中
            const relsPath = `${currentFolder}/_rels/${currentFileName.replace('.xml', '.xml.rels')}`;

            // 尝试从localStorage获取.rels文件内容
            const relsKey = `rels_${currentFolder}_${currentFileName}`;
            let relsContent = localStorage.getItem(relsKey);

            if (!relsContent) {
                // 如果localStorage中没有，尝试从其他可能的位置获取
                // 这里可以根据实际情况调整获取逻辑
                // console.log(`ℹ️ localStorage中没有找到.rels文件: ${relsKey}`);
                return null;
            }

            // 解析XML内容
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(relsContent, 'text/xml');

            if (xmlDoc.documentElement.nodeName === 'parsererror') {
                // console.log('❌ 解析.rels文件XML失败');
                return null;
            }

            // 查找指定ID的Relationship
            const relationship = xmlDoc.querySelector(`Relationship[Id="${relationshipId}"]`);

            if (relationship) {
                const target = relationship.getAttribute('Target');
                const type = relationship.getAttribute('Type');

                if (target) {
                    // console.log(`✅ 找到图片路径: ${target} (类型: ${type})`);
                    return target;
                }
            }

            // console.log(`ℹ️ 未找到ID为 ${relationshipId} 的关系`);
            return null;

        } catch (error) {
            console.error(`❌ 获取图片路径失败:`, error);
            return null;
        }
    }

    /**
     * 从当前文件路径推断文件夹和文件名
     * @param {string} filePath - 文件路径
     * @returns {object} 包含folder和fileName的对象
     */
    parseFilePath(filePath) {
        try {
            // 验证输入参数
            if (!filePath || typeof filePath !== 'string') {
                console.warn('❌ 无效的文件路径:', filePath);
                return { folder: '', fileName: '' };
            }

            // 清理路径，移除多余的空格和斜杠
            const cleanPath = filePath.trim().replace(/^\/+|\/+$/g, '');

            if (!cleanPath) {
                console.warn('❌ 文件路径为空或只包含斜杠:', filePath);
                return { folder: '', fileName: '' };
            }

            // 分割路径
            const pathParts = cleanPath.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                console.warn('❌ 文件路径格式不正确，需要至少包含文件夹和文件名:', filePath);
                return { folder: '', fileName: '' };
            }

            const fileName = pathParts[pathParts.length - 1]; // 获取文件名
            const folder = pathParts[pathParts.length - 2]; // 获取文件夹名

            // 验证文件名和文件夹名
            if (!fileName || !folder) {
                console.warn('❌ 无法提取有效的文件名或文件夹名:', { filePath, fileName, folder });
                return { folder: '', fileName: '' };
            }

            // console.log(`✅ 成功解析文件路径: ${filePath} -> 文件夹: ${folder}, 文件名: ${fileName}`);

            return {
                folder: folder,
                fileName: fileName
            };

        } catch (error) {
            console.error('❌ 解析文件路径失败:', error, '文件路径:', filePath);
            return { folder: '', fileName: '' };
        }
    }

    /**
     * 为编辑器添加颜色小方块
     */
    addColorBlocksToEditor(editorId, editor) {
        try {
            if (!this.isInitialized) {
                // console.log('⏳ 颜色装饰器未初始化，等待初始化完成...');
                setTimeout(() => this.addColorBlocksToEditor(editorId, editor), 1000);
                return;
            }

            // console.log(`🎨 为编辑器 ${editorId} 启用颜色小方块功能...`);

            // 检查编辑器是否支持colorDecorators选项
            if (editor && editor.updateOptions) {
                try {
                    // 启用颜色装饰器
                    editor.updateOptions({
                        colorDecorators: true
                    });
                    // console.log(`✅ 编辑器 ${editorId} 已启用颜色装饰器`);
                } catch (error) {
                    console.warn(`⚠️ 编辑器 ${editorId} 启用颜色装饰器失败:`, error);
                }
            }

            // 启用内联提示功能（用于显示EMU数值转换）
            if (editor && editor.updateOptions) {
                try {
                    editor.updateOptions({
                        inlayHints: { enabled: this.inlayHintsEnabled ? 'on' : 'off' }
                    });
                    // console.log(`✅ 编辑器 ${editorId} 已启用内联提示功能 (状态: ${this.inlayHintsEnabled ? '启用' : '禁用'})`);
                } catch (error) {
                    console.warn(`⚠️ 编辑器 ${editorId} 启用内联提示功能失败:`, error);
                }
            }

        } catch (error) {
            console.error(`❌ 为编辑器 ${editorId} 启用颜色小方块失败:`, error);
        }
    }

    /**
     * 注册编辑器
     */
    registerEditor(editorId, editor) {
        try {
            // console.log(`✅ 编辑器 ${editorId} 已注册到颜色装饰器`);

            // 为编辑器启用颜色小方块功能
            this.addColorBlocksToEditor(editorId, editor);

        } catch (error) {
            console.error(`❌ 注册编辑器 ${editorId} 到颜色装饰器失败:`, error);
        }
    }

    /**
     * 销毁装饰器
     */
    destroy() {
        if (this.colorProvider) {
            try {
                this.colorProvider.dispose();
                this.colorProvider = null;
                // console.log('✅ ColorProvider已销毁');
            } catch (error) {
                console.warn('⚠️ 销毁ColorProvider失败:', error);
            }
        }

        if (this.emuInlayHintsProvider) {
            try {
                this.emuInlayHintsProvider.dispose();
                this.emuInlayHintsProvider = null;
                // console.log('✅ EMU InlayHintsProvider已销毁');
            } catch (error) {
                console.warn('⚠️ 销毁EMU InlayHintsProvider失败:', error);
            }
        }

        // console.log('✅ XML颜色装饰器已销毁');
    }

    /**
     * 调试方法：查看localStorage中的主题色数据结构
     */
    debugThemeColorsData() {
        // console.log('🔍 === 调试主题色数据结构 ===');

        // 检查localStorage中的powerpointDocumentInfo
        const localStorageKey = 'powerpointDocumentInfo';
        const storedData = localStorage.getItem(localStorageKey);

        if (storedData) {
            try {
                const documentInfo = JSON.parse(storedData);
                // console.log('✅ 找到powerpointDocumentInfo:', documentInfo);

                if (documentInfo.themeColors) {
                    // console.log('🎨 themeColors节点结构:', documentInfo.themeColors);
                    // console.log('themeColors类型:', typeof documentInfo.themeColors);
                    // console.log('themeColors是否为数组:', Array.isArray(documentInfo.themeColors));

                    if (typeof documentInfo.themeColors === 'object') {
                        // console.log('themeColors的所有键:', Object.keys(documentInfo.themeColors));

                        // 检查每个键的内容
                        Object.keys(documentInfo.themeColors).forEach(key => {
                            const value = documentInfo.themeColors[key];
                            // console.log(`  ${key}:`, value, `(类型: ${typeof value})`);

                            if (typeof value === 'object' && value !== null) {
                                // console.log(`    ${key}的子键:`, Object.keys(value));
                            }
                        });
                    }
                } else {
                    // console.log('ℹ️ 没有找到themeColors节点');
                    // console.log('可用的顶级节点:', Object.keys(documentInfo));
                }

            } catch (parseError) {
                console.error('❌ 解析powerpointDocumentInfo失败:', parseError);
                // console.log('原始数据:', storedData);
            }
        } else {
            // console.log('ℹ️ localStorage中没有找到powerpointDocumentInfo');

            // 列出所有localStorage键
            const allKeys = Object.keys(localStorage);
            // console.log('localStorage中的所有键:', allKeys);

            // 查找可能包含主题色信息的键
            const possibleKeys = allKeys.filter(key =>
                key.toLowerCase().includes('theme') ||
                key.toLowerCase().includes('color') ||
                key.toLowerCase().includes('powerpoint') ||
                key.toLowerCase().includes('document')
            );

            if (possibleKeys.length > 0) {
                // console.log('🔍 可能包含主题色信息的键:', possibleKeys);
                possibleKeys.forEach(key => {
                    try {
                        const data = localStorage.getItem(key);
                        // console.log(`键 ${key} 的内容预览:`, data.substring(0, 300) + '...');
                    } catch (e) {
                        // console.log(`键 ${key} 无法读取内容`);
                    }
                });
            }
        }

        // console.log('🔍 === 调试结束 ===');
    }
}

// 创建全局实例
window.xmlColorDecorator = new XmlColorDecorator();

// 全局函数：为编辑器添加颜色小方块
function addColorBlocksToEditor(editorId, editor) {
    if (window.xmlColorDecorator) {
        window.xmlColorDecorator.registerEditor(editorId, editor);
    }
}

// 全局函数：调试主题色数据结构
function debugThemeColorsData() {
    if (window.xmlColorDecorator) {
        window.xmlColorDecorator.debugThemeColorsData();
    } else {
        // console.log('❌ xmlColorDecorator未加载');
    }
}

// 全局函数：获取内联提示状态
function getInlayHintsEnabled() {
    if (window.xmlColorDecorator) {
        return window.xmlColorDecorator.inlayHintsEnabled;
    }
    return false;
}

// 全局函数：设置内联提示状态
function setInlayHintsEnabled(enabled) {
    if (window.xmlColorDecorator) {
        window.xmlColorDecorator.inlayHintsEnabled = enabled;

        // 更新所有已注册的编辑器
        if (window.monacoEditorManager) {
            window.monacoEditorManager.editors.forEach((editor, editorId) => {
                if (editor.instance && editor.language === 'xml') {
                    try {
                        editor.instance.updateOptions({
                            inlayHints: { enabled: enabled ? 'on' : 'off' }
                        });
                        // console.log(`✅ 编辑器 ${editorId} 内联提示已${enabled ? '启用' : '禁用'}`);
                    } catch (error) {
                        console.warn(`⚠️ 更新编辑器 ${editorId} 内联提示状态失败:`, error);
                    }
                }
            });
        }

        // console.log(`✅ 内联提示状态已设置为: ${enabled ? '启用' : '禁用'}`);
    } else {
        // console.log('❌ xmlColorDecorator未加载');
    }
}

// 全局函数：切换内联提示状态
function toggleInlayHints() {
    if (window.xmlColorDecorator) {
        const currentState = window.xmlColorDecorator.inlayHintsEnabled;
        setInlayHintsEnabled(!currentState);
    } else {
        // console.log('❌ xmlColorDecorator未加载');
    }
}

// 全局函数：通过.rels文件获取图片相对地址
function getImagePathFromRels(filePath, relationshipId) {
    if (window.xmlColorDecorator) {
        return window.xmlColorDecorator.getImagePathFromRels(filePath, relationshipId);
    } else {
        console.error('❌ xmlColorDecorator未加载');
        return null;
    }
}

// 全局函数：设置当前编辑的文件信息到localStorage
function setCurrentEditingFile(filePath) {
    try {
        // 验证输入参数
        if (!filePath || typeof filePath !== 'string') {
            console.warn('❌ 无效的文件路径:', filePath);
            return;
        }

        // 从文件路径中提取文件夹和文件名
        const pathParts = filePath.split('/').filter(part => part.length > 0);

        if (pathParts.length < 2) {
            console.warn('❌ 文件路径格式不正确，需要至少包含文件夹和文件名:', filePath);
            return;
        }

        const fileName = pathParts[pathParts.length - 1]; // 获取文件名
        const folder = pathParts[pathParts.length - 2]; // 获取文件夹名

        if (!fileName || !folder) {
            console.warn('❌ 无法提取有效的文件名或文件夹名:', { filePath, fileName, folder });
            return;
        }

        const fileInfo = {
            folder: folder,
            fileName: fileName,
            fullPath: filePath,
            timestamp: Date.now()
        };
        localStorage.setItem('currentEditingFile', JSON.stringify(fileInfo));
        // console.log(`✅ 已设置当前编辑文件: ${filePath}`);
    } catch (error) {
        console.error('❌ 设置当前编辑文件信息失败:', error);
    }
}

// 全局函数：加载.rels文件内容到localStorage
function loadRelsFile(filePath, relsContent) {
    try {
        // 验证输入参数
        if (!filePath || typeof filePath !== 'string') {
            console.warn('❌ 无效的文件路径:', filePath);
            return false;
        }

        if (!relsContent || typeof relsContent !== 'string') {
            console.warn('❌ 无效的.rels文件内容:', relsContent);
            return false;
        }

        // 从文件路径中提取文件夹和文件名
        const pathParts = filePath.split('/').filter(part => part.length > 0);

        if (pathParts.length < 2) {
            console.warn('❌ 文件路径格式不正确，需要至少包含文件夹和文件名:', filePath);
            return false;
        }

        const fileName = pathParts[pathParts.length - 1]; // 获取文件名
        const folder = pathParts[pathParts.length - 2]; // 获取文件夹名

        if (!fileName || !folder) {
            console.warn('❌ 无法提取有效的文件名或文件夹名:', { filePath, fileName, folder });
            return false;
        }

        const relsKey = `rels_${folder}_${fileName}`;
        localStorage.setItem(relsKey, relsContent);
        // console.log(`✅ 已加载.rels文件: ${relsKey}`);
        return true;
    } catch (error) {
        console.error('❌ 加载.rels文件失败:', error);
        return false;
    }
}

// 全局函数：批量加载多个.rels文件
function loadMultipleRelsFiles(relsFiles) {
    try {
        let successCount = 0;
        let totalCount = relsFiles.length;

        relsFiles.forEach(fileInfo => {
            if (loadRelsFile(fileInfo.filePath, fileInfo.content)) {
                successCount++;
            }
        });

        // console.log(`✅ 批量加载.rels文件完成: ${successCount}/${totalCount} 成功`);
        return successCount;
    } catch (error) {
        console.error('❌ 批量加载.rels文件失败:', error);
        return 0;
    }
}

// 全局函数：获取已加载的.rels文件列表
function getLoadedRelsFiles() {
    try {
        const loadedFiles = [];
        const allKeys = Object.keys(localStorage);

        allKeys.forEach(key => {
            if (key.startsWith('rels_')) {
                const parts = key.replace('rels_', '').split('_');
                if (parts.length >= 2) {
                    const fileName = parts.slice(1).join('_'); // 处理文件名中可能包含下划线的情况
                    loadedFiles.push({
                        folder: parts[0],
                        fileName: fileName,
                        key: key
                    });
                }
            }
        });

        return loadedFiles;
    } catch (error) {
        console.error('❌ 获取已加载的.rels文件列表失败:', error);
        return [];
    }
}


function debugPathParsing(filePath) {
    console.log('🔍 === 调试路径解析 ===');
    console.log('输入文件路径:', filePath);
    console.log('路径类型:', typeof filePath);
    console.log('路径长度:', filePath ? filePath.length : 'N/A');

    if (filePath && typeof filePath === 'string') {
        // 清理路径
        const cleanPath = filePath.trim().replace(/^\/+|\/+$/g, '');
        console.log('清理后路径:', cleanPath);

        // 分割路径
        const pathParts = cleanPath.split('/').filter(part => part.length > 0);
        console.log('路径片段:', pathParts);
        console.log('片段数量:', pathParts.length);

        if (pathParts.length >= 2) {
            const fileName = pathParts[pathParts.length - 1];
            const folder = pathParts[pathParts.length - 2];
            console.log('提取的文件夹:', folder);
            console.log('提取的文件名:', fileName);

            // 测试解析结果
            if (window.xmlColorDecorator) {
                const parsedPath = window.xmlColorDecorator.parseFilePath(filePath);
                console.log('解析结果:', parsedPath);
            }
        } else {
            console.log('❌ 路径片段不足，无法提取文件夹和文件名');
        }
    } else {
        console.log('❌ 无效的文件路径');
    }

    console.log('🔍 === 调试结束 ===');
}

// 全局函数：测试.rels文件功能
function testRelsFunctionality(filePath) {
    console.log('🧪 === 测试.rels文件功能 ===');

    if (!filePath) {
        console.log('❌ 请提供文件路径参数');
        return;
    }

    // 测试路径解析
    debugPathParsing(filePath);

    // 测试设置当前编辑文件
    console.log('\n📝 测试设置当前编辑文件...');
    setCurrentEditingFile(filePath);

    // 检查localStorage
    const currentFile = localStorage.getItem('currentEditingFile');
    console.log('当前编辑文件信息:', currentFile ? JSON.parse(currentFile) : '未设置');

    // 测试加载.rels文件
    console.log('\n📁 测试加载.rels文件...');
    const testRelsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2007/relationships/hdphoto" Target="../media/hdphoto1.wdp"/>
  <Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2007/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

    const loadResult = loadRelsFile(filePath, testRelsContent);
    console.log('加载结果:', loadResult ? '成功' : '失败');

    // 测试获取图片路径
    console.log('\n🖼️ 测试获取图片路径...');
    const imagePath1 = getImagePathFromRels(filePath, 'rId3');
    const imagePath2 = getImagePathFromRels(filePath, 'rId2');
    console.log('rId3 ->', imagePath1);
    console.log('rId2 ->', imagePath2);

    // 清理测试数据
    const pathParts = filePath.split('/').filter(part => part.length > 0);
    if (pathParts.length >= 2) {
        const fileName = pathParts[pathParts.length - 1];
        const folder = pathParts[pathParts.length - 2];
        const relsKey = `rels_${folder}_${fileName}`;
        localStorage.removeItem(relsKey);
        console.log('已清理测试数据:', relsKey);
    }

    console.log('🧪 === 测试完成 ===');
} 