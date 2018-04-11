#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const phantom = require('phantom');
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
let spinner = null;
let config = null;
let cbLength = 0;
let finalCss = [];
let tempFilePath = dir + '\/fsp\/';
const baseUrl = 'http://ossweb-img.qq.com/images/js/fsp/';



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
    let fileInitLength = 0;
    function writeInitFile(baseUrl,fileName) {
        http.get(baseUrl+fileName, (res) => {
            let data = '';
        res.on('data', (chunk) => {
            data += chunk.toString();
        });
            res.on('end',function () {
                fs.writeFileSync(dir+'/'+fileName, data, 'utf8');
                doneFn();
            })
        })
    };
    writeInitFile(baseUrl,'fspconfig.js')
    function doneFn() {
        fileInitLength++;
        if(fileInitLength == 2){
            console.log(chalk.bgGreen.black('配置文件生成完毕')+'  配置' +chalk.green(' fspconfig.js ') + '后，执行' + chalk.green(' fsp run ') +'即可运行主程序')
        }
    }

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
        execSync('rm -r ' + tempFilePath)
    }
}

function doM() {
    if(!checkFile().status){ console.log(chalk.bgGreen.black(checkFile().console)); return;}
    // spinner.text = '正在读取远程文件';
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
        var readerNumber = 0;
        config.url.forEach(function(key,index){
            spinner.text = '正在读取'+key;
            (async function() {
                const instance = await phantom.create();
                const page = await instance.createPage();
                await page.on('onResourceRequested', function(req) {
                    if(req.url.indexOf('.css') >0){
                        req.url = req.url.split('?')[0]
                        finalCss.push(req.url);
                    }
                });
                const status = await page.open(key);
                const content = await page.property('content');
                let  fileName = hashCode(parseInt(new Date().getUTCMilliseconds()).toString());
                fs.writeFileSync('fsp/'+ fileName +'.html', content);
                await  m();
                await instance.exit();

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
            http.get(finalCss[i], (res) => {
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


    var contentClear = new CleanCSS().minify(content).styles;

    let files = [];
    rd.eachFileFilterSync(tempFilePath, /\.html$/,function (f,s) {
        files.push(f);
    });
    let nowIndex = 0;
    files.forEach(function (key,index) {

            fs.readFile(key,function (err,data) {
                if(err) console.log(err);
                pageContent = data.toString().replace(new RegExp("(<link.*\\s+href=(?:\"[^\"]*\"|'[^']*')[^<]*>)","gm"),'');
                fs.writeFile(tempFilePath+key.replace(dir+'\\fsp\\',''),pageContent+'<style type="text/css">'+ contentClear +'</style>','',function () {
                    nowIndex++;
                    if(nowIndex == files.length){
                        runFontSpider(files);
                    }

                });

            })

    })
}

function runFontSpider(f) {
    console.log()
    fontSpider.spider(f, {
        silent: false
    }).then(function(webFonts) {
        return fontSpider.compressor(webFonts, {backup: true});
    }).then(function(webFonts) {
        if(!!spinner){spinner.stop();}
        exec('rm -r ' + tempFilePath, function (err, stdout, stderr) {
            if(webFonts.length == 0){
                console.log('没有发现可以优化的自定义字体')
            }else{
                if(!!spinner){spinner.stop();}
                let totalSize = 0;
                webFonts.forEach(function (W,index) {
                    console.log('')
                    console.log(chalk.green('已提取')+ chalk.bgGreen.black(W.chars.length)+chalk.green('个') + chalk.bgGreen.black(W.family)+chalk.green('字体：'))
                    console.log(chalk.white(' '+ W.chars+' '))
                    console.log(chalk.white('生成字体文件：'))
                    W.files.forEach(function (F,index) {
                        console.log(chalk.whiteBright('* '+F.url  ) + chalk.cyan(' (优化体积：'+(parseInt((W.originalSize - F.size)/1024))+'KB)') )
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