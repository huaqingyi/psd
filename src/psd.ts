import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs-extra';
import { basename, dirname, extname, join } from 'path';
import { blue, green, red, yellow } from 'colors';
import psd from 'psd';
import { map, isArray } from 'lodash';

export interface PSDOption {
    output?: string;
    imgDir?: string;
    layerDir?: string;
    name?: string;
    template?: string;
    rem?: number;
}

export class PSD {
    private appName: string;
    private pngId: number;
    private groupId: number;
    private viewRect: { width: number; height: number; };

    constructor(
        protected filename: string,
        protected option: PSDOption,
    ) {
        this.appName = '';
        this.pngId = 0;
        this.groupId = 0;
        this.viewRect = { width: 0, height: 0 };
        this.filename = join('', filename || '');
        this.option.output = option.output || dirname(this.filename);
        this.option.imgDir = option.imgDir || join(this.option.output || '', 'images');
        if (existsSync(this.option.output)) rmdirSync(this.option.output, { recursive: true });
        mkdirSync(this.option.output);
        if (!existsSync(this.option.imgDir)) mkdirSync(this.option.imgDir);
    }

    public async compile() {
        if (!existsSync(this.filename)) {
            return console.warn(blue(`PSD file ${this.filename} not exists.`))
        }
        return psd.open(this.filename);
    }

    public async findArrAndReverse(tree) {
        if (tree._children && tree._children.length > 0) {
            tree._children = tree._children.reverse();
            map(tree._children, item => this.findArrAndReverse(item));
        }
    }

    public async createTextByJSON(){

    }

    public async createDivByJSON(treeJSON) {
        return await Promise.all(map(treeJSON.children, async (item, i) => {
            if (item.type == 'layer' && item.visible && item.width && item.height) {
                const style = {
                    'position': `absolute`,
                    'top': `50%`,
                    'width': `${item.width / 100}rem`,
                    'height': `${item.height / 100}rem`,
                    'left': `${item.left / 100}rem`,
                    'margin-top': `${-(this.viewRect.height / 100 / 2 - item.top / 100)}rem`,
                    'background': `url(./images/${item.name}.png)`,
                    'background-size': `100% auto`,
                };
                return { tagName: 'div', attrs: { class: item.name }, className: item.name, style };
            } else if (item.type == 'group' && item.visible) {
                return {
                    tagName: 'div', attrs: { class: item.name },
                    className: item.name, children: await this.createDivByJSON(item) || [],
                };
            }
        }));
    }

    public async getHTML(asts) {
        return Promise.all(map(asts, async ast => {
            if (!ast) return '';
            const { tagName, attrs, children, style = {} } = ast;
            if (!tagName) return '';
            const as: string[] = [];
            map(attrs, (o, i) => as.push(`${i}="${o}"`));
            const se: string[] = [];
            map(style, (o, i) => se.push(`${i}: ${o};`));
            if (children && isArray(children) && children.length > 0) {
                const child = await this.getHTML(children);
                return `<${tagName} ${as.join(' ')} style="${se.join('')}">${child.join('')}</${tagName}>`;
            }
            return `<${tagName} ${as.join(' ')} style="${se.join('')}"></${tagName}>`;
        }));
    }

    public async build() {
        const context = await this.compile();
        const tree = context.tree();
        const treeJson = tree.export();
        this.viewRect = {
            width: treeJson.document.width,
            height: treeJson.document.height,
        };
        this.findArrAndReverse(tree);
        tree.descendants().forEach((node) => {
            if (node.isGroup()) {
                node.name = `group_${this.groupId}`;
                this.groupId++;
                return false;
            }
            if (node.layer.visible) {
                node.name = `dv_${this.appName}_layer_${this.pngId}`;
                this.pngId++;
                console.log(yellow(`saving ${join(this.option.imgDir || '', `${node.name}.png`)}`));
                node.saveAsPng(join(this.option.imgDir || '', `${node.name}.png`));
            } else {
            }
        });
        const domJSON = tree.export();
        writeFileSync(join(this.option.output || '', 'ast.json'), JSON.stringify(treeJson, null, 2), { encoding: 'utf-8' });
        // writeFileSync(join(this.option.output || '', 'json.json'), JSON.stringify(await this.createDivByJSON(domJSON), null, 2), { encoding: 'utf-8' });
        const html = (await this.getHTML(await this.createDivByJSON(domJSON))).join('');
        // console.log(html);
        const fullHtml = [
            `<!doctype html>`,
            `<html>`,
            `<head>`,
            `<meta charset="utf-8" />`,
            `<meta content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" name="viewport" />`,
            `<meta content="yes" name="apple-mobile-web-app-capable" />`,
            `<meta content="black" name="apple-mobile-web-app-status-bar-style" />`,
            `<meta content="telephone=no" name="format-detection" />`,
            `<meta content="email=no" name="format-detection" />`,
            `<title>PSD TO HTML</title>`,
            `<script type="text/javascript">`,
            `(function(win, doc, dw) {`,
            `var docEl = doc.documentElement,`,
            `dw = dw || 640,`,
            `resizeEvt = 'orientationchange' in window ? 'orientationchange' : 'resize',`,
            `recalc = function() {`,
            `var docElWidth = docEl.clientWidth;`,
            `(docElWidth > dw) && (docElWidth = dw);`,
            `if (!docElWidth) return;`,
            `docEl.style.fontSize = docElWidth / (dw / 100) + 'px';  //基于750px设计稿`,
            `};`,
            `if (!doc.addEventListener) return;`,
            `win.addEventListener(resizeEvt, recalc, false);`,
            `doc.addEventListener('DOMContentLoaded', recalc, false);`,
            `})(window, document, 750);`,
            `</script>`,
            `<style type="text/css">`,
            `* { margin:0; padding:0; }`,
            `html, body { height:100%; width:100%; position: relative; overflow-x: hidden; }`,
            `.wrap { height:100%; position: relative; overflow: hidden;}`,
            `</style>`,
            `</head>`,
            `<body>`,
            `<div class="wrap">`,
            `${html}`,
            `</div>`,
            `</body>`,
            `</html>`,
        ].join('\n');
        await writeFileSync(join(this.option.output || '', 'index.html'), fullHtml);
    }
}