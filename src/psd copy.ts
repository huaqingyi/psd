import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs-extra';
import { basename, dirname, extname, join } from 'path';
import { blue, green, red, yellow } from 'colors';
import psd from 'psd';
import mkdirp from 'mkdirp';
import { isString, map } from 'lodash';
import { createHash } from 'crypto';
import { format } from 'url';
import jdists from 'jdists';
import { inspect } from 'util';

export interface PSDOption {
    output?: string;
    imgDir?: string;
    layerDir?: string;
    name?: string;
    template?: string;
    rem?: number;
}

export class PSD {

    public template: string;
    public styles: string[];
    private zIndex: number;

    constructor(
        protected filename: string,
        protected option: PSDOption,
    ) {
        this.template = '';
        this.styles = [];
        this.zIndex = 10000;
        this.filename = join('', filename || '');
        this.option.output = option.output || dirname(this.filename);
        this.option.imgDir = option.imgDir || join(this.option.output || '', 'images');
        if (existsSync(this.option.output)) rmdirSync(this.option.output, { recursive: true });
        mkdirSync(this.option.output);
        if (!existsSync(this.option.imgDir)) mkdirSync(this.option.imgDir);
    }

    public rgba2color(value: Array<string | number>) {
        if (value[3] === 255) {
            return '#' + value.slice(0, -1).map(value => {
                return (0x100 + parseInt(String(value))).toString(16).slice(1);
            }).join('').replace(/(.)\1(.)\2(.)\3/, '$1$2$3');
        } else {
            return 'rgba(' + value.join() + ')';
        }
    }

    public async compile() {
        if (!existsSync(this.filename)) {
            return console.warn(blue(`PSD file ${this.filename} not exists.`))
        }
        this.template = this.option.template || join(__dirname, '../tpl/page.html');
        if (!existsSync(this.template)) {
            return console.warn(blue(`Template file ${this.template} not exists.`))
        }
        return psd.open(this.filename);
    }

    public inspectTreeNode(node, id) {
        if (!node) return '<null>';
        const children = node.children();
        return {
            __id__: id, type: node.type, name: node.name,
            isRoot: node.isRoot(), coords: node.coords,
            offset: { top: node.topOffset, left: node.leftOffset },
            childrenCount: children ? children.length : 0,
        };
    }

    public rem(value: number) {
        return this.option.rem ? `${value / this.option.rem}rem` : `${value}px`;
    }

    public scanTree(psdNode, htmlNode, id) {
        if (!psdNode.isRoot() && psdNode.layer && !psdNode.layer.visible) {
            console.log(yellow(`ignore invisible layer ${id} ${psdNode.name}`));
            Object.assign(htmlNode, { tagName: 'div', isValid: false, isVisible: false });
            return htmlNode;
        }

        const children = psdNode.children();
        const isLink = /\|link$/.test(psdNode.name);
        Object.assign(htmlNode, {
            tagName: isLink ? 'a' : 'div',
            className: psdNode.type, id: 'p' + id,
            children: [], style: {
                'z-index': this.zIndex--,
                top: this.rem(psdNode.coords.top),
                left: this.rem(psdNode.coords.left),
                width: this.rem((psdNode.coords.right - psdNode.coords.left)),
                height: this.rem((psdNode.coords.bottom - psdNode.coords.top)),
            }, 'data-node-name': psdNode.name,
        });
        if (isLink) { htmlNode.href = 'javascript:;' }
        if (psdNode.type === 'layer' && psdNode.layer) {
            if (!psdNode.layer.visible) {
                console.log(yellow(`ignore invisible layer ${id} ${psdNode.name}`));
                htmlNode.style.display = 'none';
                return htmlNode;
            }
            const exportedPsdNode = psdNode.export();

            if (exportedPsdNode) {
                // text node
                const text = exportedPsdNode.text;
                if (text) {
                    console.log(yellow(`rendering ${JSON.stringify(text)} node ${id}: `));

                    htmlNode.className = `${htmlNode.className} text`;
                    htmlNode.innerText = text.value;

                    const textLines = text.value.split('\r').length || text.value.split('\n').length;
                    htmlNode.style['line-height'] = this.rem(Math.round((psdNode.coords.bottom - psdNode.coords.top) / textLines) + 1);

                    const font = text.font;
                    if (font) {
                        if (font.name) { htmlNode.style['font-family'] = font.name; }
                        if (font.sizes && font.sizes[0]) { htmlNode.style['font-size'] = this.rem(font.sizes[0]); }

                        if (font.colors && font.colors[0]) {
                            const color = font.colors[0];
                            htmlNode.style['color'] = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                        }

                        if (font.alignment && font.alignment[0]) {
                            htmlNode.style['text-align'] = font.alignment[0];
                        }
                    }

                    return htmlNode;
                }
            }

            if (psdNode.layer.image && psdNode.layer.image.saveAsPng) {
                console.log(yellow(`saving ${join(this.option.imgDir || '', `${id}.png`)}`));

                psdNode.layer.image.saveAsPng(join(this.option.imgDir || '', `${id}.png`));
                htmlNode.style['background-image'] = `url(.${(this.option.imgDir || '').replace(
                    dirname(this.option.imgDir || ''), ''
                )}/${id}.png)`
            }
        }

        children.forEach((childPsdNode, i) => {
            var childDomNode = {}
            htmlNode.children.push(childDomNode)
            this.scanTree(childPsdNode, childDomNode, `${id}_${i}`)
        });
    }

    public renderParse(something) {
        if (something === null || typeof something === 'undefined') {
            return '';
        }

        return (something + '') || '';
    }

    public renderTags(tag) {
        const ast: any = { tagName: tag.tagName, attrs: {} };
        if (!tag) {
            throw new Error(`Invalid tag: ${JSON.stringify(tag)}`);
        }
        
        if (arguments.length >= 2) {
            ast.tagName = arguments[0];
            tag = arguments[1];
        } else {
            ast.tagName = tag.tagName || 'p';
        }

        // 处理是否渲染
        if ('isValid' in tag && !tag.isValid) return {};

        // 处理是否显示
        if ('isVisible' in tag) {
            if (!tag.isVisible) {
                ast.style = (tag.style || {});
                ast.style.display = 'none';
            }
        }

        const attrs = ['tagName', 'className', 'data', 'label', 'innerHTML', 'innerText', 'children'];
        map(tag, (attr, attrKey) => {
            if (tag.hasOwnProperty(attrKey) && attrs.indexOf(attrKey) === -1) {
                // disabled等属性只有在非falsy的时候才需要赋值
                if (attrKey === 'disabled' || attrKey === 'checked' || attrKey === 'readonly') {
                    if (tag[attrKey] && this.renderParse(tag[attrKey])) {
                        ast.attrs[attrKey] = attrKey;
                    }
                } else if (attrKey === 'style' && tag[attrKey] && typeof (tag[attrKey]) === 'object') {
                    const styleValueMap = tag[attrKey];
                    this.styles.push(`#${tag.id} {`);
                    this.styles.push(...map(styleValueMap, (v, k) => `${k}: ${v};`));
                    this.styles.push(`}\n`);
                } else {
                    ast.attrs[attrKey] = this.encodeHtmlAttribute(this.renderParse(tag[attrKey]));
                }
            }
        });
        if (tag.className) {
            ast.className = this.encodeHtmlAttribute(this.renderParse(tag.className));
        }
        if (tag.data) {
            map(tag.data, (data, dataKey) => {
                if (tag.data.hasOwnProperty(dataKey)) {
                    ast[dataKey] = this.encodeHtmlAttribute(this.renderParse(data));
                }
            });
        }
        
        if (['input','img'].indexOf(ast.tagName) === -1) {
            let innerHtml = tag.innerHTML || this.encodeHtmlSpecialChars(this.renderParse(tag.innerText || tag.label)) || '';
            if (!innerHtml && tag.children) {
                ast.children = map(tag.children, child => {
                    if (isString(child)) return child;
                    return this.renderTags(child);
                });
            }
        }
        return ast;
    }

    public encodeHtmlSpecialChars(text) {
        text = (text === 0 ? '0' : (text || '')) + '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    public encodeHtmlAttribute(attr) {
        attr = (attr === 0 ? '0' : (attr || '')) + '';
        return this.encodeHtmlSpecialChars(attr).replace(/\n/g, "&#10;");
    }

    public async build() {
        const context = await this.compile();
        const tree = context.tree();
        const domRoot = {};
        this.scanTree(tree, domRoot, 0);
        console.log(green(`Got DOM tree: `));
        console.log(green(inspect(domRoot, true, 10, true)));
        console.log(green(`Rendering DOM tree to HTML...`));
        const domHtml = this.renderTags(domRoot);
        // console.log(domHtml);
        await writeFileSync(join(this.option.output || '', 'ast.json'), JSON.stringify(domHtml, null, 2));
    }
}