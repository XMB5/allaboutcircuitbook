/*
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const cheerio = require('cheerio');
const Epub = require('epub-gen');
const path = require('path');
const url = require('url');
const baseUrl = 'https://www.allaboutcircuits.com/';
const request = require('request-promise-native').defaults({
    gzip: true,
    forever: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
                      'Chrome/70.0.3538.110 Safari/537.36'
    },
    baseUrl
});

async function listTextbooks() {
    let doc = cheerio.load(await request('/textbook'));
    let panels = doc('div.panel.panel-default.item');
    let textbooks = [];
    panels.each((i, panel) => {
        let title = doc('h3', panel).text();
        let url = doc('a.btn', panel).attr('href');
        textbooks.push({title, url});
    });
    return textbooks;
}

async function downloadTableOfContents(textbook) {
    console.log('download table of contents for textbook', textbook.title);
    let doc = cheerio.load(await request(textbook.url));
    //the introduction is 2 elements after the header
    let introduction = doc(doc(doc('.page-header').next()).next()).html().trim();
    //iterate over the chapters
    let chapters = [];
    doc('.panel').each((i, elem) => {
        let panel = doc(elem);
        let title = doc('h3', panel).text();
        //iterate over the sections in the chapter
        let sections = [];
        doc('li', panel).each((i, elem) => {
            let li = doc(elem);
            let name = li.text();
            let url = doc('a', li).attr('href');
            sections.push({name, url});
        });
        chapters.push({title, sections});
    });
    return {introduction, chapters};
}

async function downloadSection(section) {
    console.log('download section', section.name);
    let doc = cheerio.load(await request(section.url));
    let article = doc('article');
    //remove extraneous content
    for (let selector of ['h4', '.hidden-print', '.hidden-xs', '.hidden-sm', '.leaderboard_ad', 'small']) {
        doc(selector, article).remove();
    }
    //change image urls to absolute urls
    doc('img', article).each((i, elem) => {
        let img = doc(elem);
        let src = img.attr('src');
        let absoluteSrc = url.resolve(baseUrl, src);
        img.attr('src', absoluteSrc);
    });
    return article.html().trim();
}

async function downloadChapter(chapter) {
    console.log('download chapter', chapter.title);
    let html = '';
    for (let section of chapter.sections) {
        html += await downloadSection(section);
        html += '\n\n\n';
    }
    return html;
}

async function downloadTextbook(textbook, outputDir) {
    console.log('download textbook', textbook.title);

    let index = await downloadTableOfContents(textbook);

    let epubOptions = {
        title: textbook.title,
        author: 'All About Circuits',
        output: path.join(outputDir, textbook.title + '.epub'),
        content: []
    };

    for (let chapter of index.chapters) {
        let chapterHtml = await downloadChapter(chapter);
        epubOptions.content.push({
            title: chapter.title,
            data: chapterHtml
        });
    }

    let epub = new Epub(epubOptions);
    await epub.promise;
}

async function main () {
    let textbooks = await listTextbooks();
    let outputDir = path.join(__dirname, 'books');
    for (let textbook of textbooks) {
        await downloadTextbook(textbook, outputDir);
    }
}

main();