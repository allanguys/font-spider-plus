#!/usr/bin/env node

const fs = require('fs');
const fse = require('fs-extra')
const http = require('http');
const https = require('https');
const path = require('path');
const puppeteer = require('puppeteer');
const program = require('commander');
const chalk = require('chalk');
const glob = require('glob');
const _ = require('lodash');
const ora = require('ora');
const child_process  = require('child_process');
const fileExists = require('file-exists');
const exec = child_process.exec;
const execSync = child_process.execSync;
const fontSpider = require('font-spider');
const CleanCSS = require('clean-css');
const rd = require('rd');
const dir = path.resolve('./');
const fspconfig = require('../assets/fspconfig');
let spinner = null;
let config = null;
let cbLength = 0;
let finalCss = [];
let fileNameList = [];
let tempFilePath = dir + '\/fsp\/';



program
    .name('fsp')
    .usage('<command>')
    .version(require('../package.json').version)
    .parse(process.argv);

program
    .command('init')
    .description('初始化本地WebFont优化相关依赖')
    .action(function() {
        initFile()
    });
program
    .command('run')
    .description('线上WebFont优化')
    .action(function() {
        doM()
    });
program
    .command('local <htmlFiles>')
    .description('本地WebFont优化')
    .action(function() {
        local(program.args[0])
    });
program.parse(process.argv);
if (!program.args.length) {
    program.help();
    process.exit(1);
}

function local(htmlFiles) {


    if(typeof  htmlFiles !== 'undefined'){
        htmlFiles = htmlFiles.split(',');
        htmlFiles = htmlFiles.map(function (file) {
            file = path.resolve(file);
            return glob.sync(file)
        })
        htmlFiles = reduce(htmlFiles);
        if(htmlFiles.length == 0){
            log()
        }else{
            spinner = ora('正在优化...').start();
            runFontSpider(htmlFiles)
        }
    }else {
        log();
    }
    
    function log() {
        console.log(chalk.bgGreen.black('请输入正确的html路径，例如 *.html,asd.html'))
    }
}
// 扁平化二维数组
function reduce(array) {
    let ret = [];

    array.forEach(function(item) {
        ret.push.apply(ret, item);
    });

    return ret;
}

//初始化文件
function initFile() {

    fs.writeFile(dir+'/fspconfig.js', fspconfig(), (err) => {
        if (err) throw err;
        console.log(chalk.bgGreen.black('fspconfig.js配置文件已生成'))
        console.log('配置' +chalk.green(' fspconfig.js ') + '后，执行' + chalk.green(' fsp run ') +'即可运行主程序')
    });
}
//初始完检查配置
function checkFile() {
    let r = {};
    r.console = '';
    r.status = false;
    const c = dir+'/fspconfig.js';

    if(!fileExists.sync(c)){
        r.console = '请先执行 "fsp init" 初始化相关依赖';
    }else{
        config = JSON.parse(fs.readFileSync(c,'utf-8'));
        if(config.url.length == 0){
            r.console = '请检查是否配置网址';
        }else {
            spinner = ora('配置读取完成').start();
        }
    }
    if(r.console == ''){
        r.status = true;
    }

    return r;

}
function clearTempDir() {
    if (fs.existsSync(tempFilePath)){
        fse.removeSync(tempFilePath)
        // execSync('rm -r ' + tempFilePath)
    }
}

function doM() {
    if(!checkFile().status){ console.log(chalk.bgGreen.black(checkFile().console)); return;}
    clearTempDir();
    let css = [];

    function hashCode(s){
        return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
    }
    fs.mkdir(tempFilePath,0777,function (err) {
        if (err) throw err;
        e()
    })
    function e() {
        let readerNumber = 0;
        spinner.text = '正在分析配置中的网址...';
        config.url.forEach(function(key,index){

            (async () => {
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                await page.setRequestInterception(true);
                page.on('request', request => {
                    request.continue(); // pass it through.
                });
                page.on('response', response => {
                     const req = response.request();
                     if(response.status() == 200 && req.url().indexOf('.css') >0){

                                finalCss.push(req.url().split('?')[0]);
                     }
                });
                await page.goto(key, {
                    waitUntil: 'load'
                });
                await page.content().then((content)=>{
                    let  fileName = hashCode(parseInt(new Date().getUTCMilliseconds()).toString());

                    fileNameList.push(fileName);
                    global[fileName] = content;
                    //fs.writeFileSync(tempFilePath + fileName +'.html', content);
                })

                await  m();
                await browser.close();
            })();
        });
        function  m(){
            readerNumber++;
            if(readerNumber ==  config.url.length) mergeCss(finalCss);
        }
    }
}

//样式文件合并为一个
function  mergeCss(finalCss) {
    finalCss = _.uniqBy(finalCss);
    let cssString = '';
    let getLength = 0;
    for(let i=0;i<finalCss.length;i++){
        (function (i) {
            var client = http;
            if (finalCss[i].toString().indexOf("https") === 0){
                client = https;
            }
            client.get(finalCss[i], (res) => {
                res.on('data', (chunk) => {
                    cssString +=chunk.toString();
                });
                res.on('end',function () {
                    getLength++;
                    if(getLength == finalCss.length){
                        saveFiles(cssString);
                    }
                })
            })
        })(i)
    }
}
function saveFiles(content) {
    content = _.replace(content, new RegExp(config.onlinePath,"gm"), config.localPath);
    let contentClear = new CleanCSS().minify(content).styles;
    let files = [];
    let nowIndex = 0;
    fileNameList.forEach(function (key,index) {

            let con = global[key].replace(new RegExp("(<link.*\\s+href=(?:\"[^\"]*\"|'[^']*')[^<]*>)","gm"),'')+'<style type="text/css">'+ contentClear +'</style>';
            files.push(tempFilePath+key+'.html');
            fs.writeFile(tempFilePath+key+'.html',con,function () {
                nowIndex++;
                if(nowIndex == fileNameList.length){
                    runFontSpider(files);
                }

            });
    });
}

function runFontSpider(f) {
    if(!!spinner){spinner.succeed('网址分析完成');}
    console.log()
    if(!!spinner){spinner.text = '正在优化...';}
    fontSpider.spider(f, {
        silent: false
    }).then(function(webFonts) {
        return fontSpider.compressor(webFonts, {backup: true});
    }).then(function(webFonts) {

        fse.remove(tempFilePath, function (err, stdout, stderr) {
            if (err) throw err;
            if(webFonts.length == 0){
                if(!!spinner){spinner.succeed('没有发现可以优化的自定义字体')}
            }else{
                if(!!spinner){spinner.succeed('优化完成')}
                if(!!spinner){spinner.stop();}
                webFonts.forEach(function (W) {
                    console.log('')
                    console.log(chalk.green('已提取')+ chalk.bgGreen.black(' '+W.chars.length+' ')+chalk.green('个') + chalk.bgGreen.black(' '+W.family+' ')+chalk.green('字体：'))
                    console.log(chalk.white(' '+ W.chars+' '))
                    console.log(chalk.white('生成字体文件：'))
                    W.files.forEach(function (F) {
                        console.log(chalk.whiteBright('* '+F.url +','+parseInt(F.size/1024)+'K') + chalk.cyan(' (已优化体积：'+(parseInt((W.originalSize - F.size)/1024))+'K)') )
                    })
                })
            };
        });
    }).catch(function(errors) {
        clearTempDir();
        if(!!spinner){
            spinner.clear();
            spinner.stop();
        }
        console.log('');
        console.error(errors);
    });
}