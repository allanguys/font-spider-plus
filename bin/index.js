#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const program = require('commander');
const chalk = require('chalk');
const _ = require('lodash');
const ora = require('ora');
const child_process  = require('child_process');
const fileExists = require('file-exists');
const exec = child_process.exec;
const execSync = child_process.execSync;
const fontSpider = require('font-spider');
const rd = require('rd');
const dir = path.resolve('./');
var spinner = null;
var config = null;
var cbLength = 0;
var finalCss = [];
var tempFilePath = dir + '\/fsp\/';
const baseUrl = 'http://ossweb-img.qq.com/images/js/fsp/';


program
    .command('init')
    .description('初始化相关文件')
    .action(function() {
        initFile()
    });
program
    .command('run')
    .description('执行主函数')
    .action(function() {
        doM()
    });


program.parse(process.argv);

//初始化文件
function initFile() {
    var fileInitLength = 0;
    
    
    function writeInitFile(baseUrl,fileName) {
        http.get(baseUrl+fileName, (res) => {
            var data = '';
        res.on('data', (chunk) => {
            data += chunk.toString();
        });
            res.on('end',function () {
                fs.writeFileSync(dir+'/'+fileName, data, 'utf8');
                doneFn();
            })
        })
    };
    writeInitFile(baseUrl,'phantom.js');
    writeInitFile(baseUrl,'fspconfig.js')
    function doneFn() {
        fileInitLength++;
        if(fileInitLength == 2){
            // doM();
            console.log(chalk.bgGreen.black('配置文件生成完毕')+'  配置' +chalk.green(' fspconfig.js ') + '后，执行' + chalk.green(' fsp run ') +'即可运行主程序')
        }
    }

}
//初始完检查配置
function checkFile() {
    var r = {};
    r.console = '';
    r.status = false;
    const p = dir+'/phantom.js';
    const c = dir+'/fspconfig.js';

    if(!fileExists.sync(p) || !fileExists.sync(c)){
        r.console = '请先执行 "fsp init" 初始化相关依赖';
    }else{
        config = JSON.parse(fs.readFileSync(c,'utf-8'));
        if(!child_process.spawnSync(config.phantomjs).stdout){
            r.console = '请检查phantomjs命令是否配置正确';

        }else if(config.url.length == 0){
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
    spinner.text = '正在读取远程文件';
    clearTempDir();
    config.url.forEach(function(key,index){
        child_process.execFile(config.phantomjs, [dir+'/phantom.js',key,index],function(error, stdout, stderr) {
            if(error) {
                console.error('error: ' + error);
                return;
            };
            spinner.clear();
            spinner.text = '正在读取：'+key;
            spinner.clear();
            finalCss = finalCss.concat(stdout.split(','));
            cbLength++;
            if(cbLength == config.url.length ){
                mergeCss();
            }
        })
    });

}


//样式文件合并为一个
function  mergeCss() {
    finalCss = _.uniqBy(finalCss);
    var cssString = '';
    var getLength = 0;
    for(var i=0;i<finalCss.length;i++){
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

    fs.writeFileSync(tempFilePath+'page.css',content);
    console.log('')
    var files = [];
    rd.eachFileFilterSync(tempFilePath, /\.html$/,function (f,s) {
        files.push(f);
    });
    var nowIndex = 0;
    files.forEach(function (key,index) {
            fs.readFile(key,function (err,data) {
                nowIndex++;
                pageContent = data.toString().replace(new RegExp("(<link.*\\s+href=(?:\"[^\"]*\"|'[^']*')[^<]*>)","gm"),'');
                fs.writeFileSync(tempFilePath+key.replace(dir+'\\fsp\\',''),pageContent+'<style type="text/css">'+ content +'</style>');
                if(nowIndex == files.length-1){
                    runFontSpider(files);
                }
            })

    })
}

function runFontSpider(f) {
    fontSpider.spider(f, {
        silent: false,
        // debug:true
    }).then(function(webFonts) {
        return fontSpider.compressor(webFonts, {backup: true});
    }).then(function(webFonts) {

        spinner.stop();
        exec('rm -r ' + tempFilePath, function (err, stdout, stderr) {
            if(webFonts.length == 0){
                console.log('没有发现自定义字体')
            }else{
                spinner.stop();
                var totalSize = 0;
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
        spinner.clear();
        spinner.stop();
        console.log('');
        console.error(errors);
    });
}