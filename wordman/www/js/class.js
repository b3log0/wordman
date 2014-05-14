/*
 * Copyright (c) 2014, B3log Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 词库操作.
 *
 * @author <a href="http://88250.b3log.org">Liang Ding</a>
 * @version 1.1.0.0, May 12, 2014
 * @since 1.0.0
 */

"use strict";

// 词库操作封装
var clazz = {
    /**
     * 第一次学习一个词库时默认的学习词数.
     * 
     * @type Number
     */
    DEFAULT_LEARN_NUM: 20,
    /**
     * 初始化词库.
     * 
     * <p>
     *   <ol>
     *     <li>如果没有初始化数据库，先初始化数据库</li>
     *     <li>将 /resources/classes/ 下的 *.zip 词库包导入到数据库中</li>
     *   </ol>
     * </p>
     * 
     * @returns {undefined}
     */
    initClasses: function() {
        dbs.initDB(function() {
            console.info('建表完毕，开始导入默认词库');

            // 导入默认的词库
            clazz.importClass('1'); // 六级必备词汇
//            clazz.importClass('2'); // 四级必备词汇
//            clazz.importClass('3');
//            clazz.importClass('4');
//            clazz.importClass('5');
//            clazz.importClass('6');
//            clazz.importClass('7');
//            clazz.importClass('8');

            // 生成 Wordman 客户端标识
            wordman();
        });
    },
    /**
     * 导入指定的词库.
     * 
     * @param {type} clazz 指定的词库
     * @returns {undefined}
     */
    importClass: function(clazz) {
        var db = dbs.openDatabase();

        JSZipUtils.getBinaryContent('resources/classes/' + clazz + '.zip', function(err, data) {
            if (err) {
                console.error('加载词库异常', err);

                throw err;
            }

            var zip = new JSZip(data);

            var initClassSqls = zip.file('class.sql').asText().split('----');
            db.transaction(function(tx) {
                async.series([
                    function() {
                        for (var i in initClassSqls) {
                            tx.executeSql(initClassSqls[i], [], function(tx, result) {
                            }, function(tx, err) {
                                console.error('导入词库 [' + clazz + '] 异常 [' + tx + ']', err);
                                throw err;
                            });
                        }
                    }, function() {
                        console.info('初始化词库 [' + clazz + '] 完毕');
                    }]);
            });
        });
    },
    /**
     * 获取指定词库的单词数.
     * 
     * @param {String} clazz 指定词库
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    countWord: function(clazz, cb) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select size from class where name = ?', [clazz], function(tx, result) {
                cb(result.rows.item(0).size);
            });
        });
    },
    /**
     * 所有词库一共单词计数.
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    countWords: function(cb) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select sum(size) as c from class', [], function(tx, result) {
                cb(result.rows.item(0).c);
            }, function(tx, err) {
                console.error(err);
            });
        });
    },
    /**
     * 获取所有词库列表.
     * 
     * <p>
     * 回调实参：
     * <pre>
     * [{
     *     id: "12",
     *     name: "六级必备词汇",
     *     size: 2087,
     *     times: 1,
     *     selected: true,
     *     learned: 500, 
     *     finished: 300, 
     * }, ....]
     * </pre>
     * </p>
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getClasses: function(cb) {
        var classes = [];

        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select * from class', [], function(tx, result) {
                for (var i = 0; i < result.rows.length; i++) {
                    classes.push(result.rows.item(i));
                }

                cb(classes);
            });
        });
    },
    /**
     * 指定词库“选定”状态.
     * 
     * <p>
     * 回调实参：
     * <pre>
     * {
     *     selected: true, 
     *     learnNum: 25, 
     * }
     * </pre>
     * </p>
     * 
     * @param {String} clazzId 指定词库 id
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    selectState: function(clazzId, cb) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select selected from class where id = ?', [clazzId], function(tx, result) {
                var ret = {};
                ret.selected = result.rows.item(0);

                db.transaction(function(tx) {
                    tx.executeSql('select count(*) as c from plan where classId = ? and date = ?', [clazzId, new Date().format('yyyyMMdd')], function(tx, result) {
                        ret.learnNum = result.rows.item(0).c;

                        // 第一次学习时使用默认学习词数
                        ret.learnNum = ret.learnNum > 0 ? ret.learnNum : clazz.DEFAULT_LEARN_NUM;

                        cb(ret);
                    });
                });
            });
        });
    },
    /**
     * 生成学习计划.
     * 
     * <p>
     * 回调实参（今天学习的单词列表）：
     * <pre>
     * [{
     *     id: "342", 
     *     word: "cloak",
     *     phon: "[klok]",
     *     ....
     * }, ....]
     * </pre>
     * </p>
     * 
     * @param {String} clazzId 词库 id
     * @param {Number} learnNum 学习单词数
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    genPlan: function(classId, learnNum, cb) {
        var words = [];

        var db = dbs.openDatabase();

        async.series([
            function() {
                // 如果学习计划有变则重建计划
                db.transaction(function(tx) {
                    var today = new Date().format('yyyyMMdd');

                    tx.executeSql('select count(*) as c from plan where classId = ? and date = ?', [clazzId, today], function(tx, result) {
                        if (learnNum !== result.rows.item(0).c) { // 用户修改了计划
                            var db = dbs.openDatabase();

                            // 删除后续计划
                            db.transaction(function(tx) {
                                tx.executeSql('delete from plan where classId = ? and date >= ?', [clazzId, today], function(tx, result) {

                                    // 新建新计划
                                    db.transaction(function(tx) {
                                        // TODO: 分页迭代添加
                                        tx.executeSql('insert into plan values (?, ?, ?, ?, ?, ?)', [dbs.genId(), classId, wordId, today, null, 0]);
                                    });
                                });
                            });
                        }
                    });
                });
            },
            function() {
                // 返回今天需要学习的单词列表
                db.transaction(function(tx) {
                    tx.executeSql('select * from plan where classId = ? and date = ?', [classId, today], function(tx, result) {
                        for (var i = 0; i < result.rows.length; i++) {
                            words.push(result.rows.item(i));
                        }

                        cb(words);
                    });
                });
            }
        ]);
    },
    /**
     * “选定”指定的词库.
     * 
     * @param {type} classId 指定的词库 id
     * @returns {undefined}
     */
    selectClass: function(classId) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('update class set selected = 1 where id = ?', [classId]);
        });
    }
};

// 2.0.0 用于标识客户端
function wordman() {
    var uuid = dbs.genId();
    var time = new Date().getTime();

    var value = {
        uuid: uuid,
        time: time
    };

    var db = dbs.openDatabase();
    db.transaction(function(tx) {
        tx.executeSql('insert into option values (?, ?, ?, ?)', [dbs.genId(), 'conf', 'client', JSON.stringify(value)], function(tx, result) {
            console.info('沃德曼 [' + JSON.stringify(value) + ']');
        }, function(tx, err) {
            console.error('生成沃德曼 UUID 异常', err);
        });
    });
}

// 对Date的扩展，将 Date 转化为指定格式的String   
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，   
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)   
// 例子：   
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423   
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18   
Date.prototype.Format = function(fmt)
{ //author: meizz   
    var o = {
        "M+": this.getMonth() + 1, //月份   
        "d+": this.getDate(), //日   
        "h+": this.getHours(), //小时   
        "m+": this.getMinutes(), //分   
        "s+": this.getSeconds(), //秒   
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度   
        "S": this.getMilliseconds()             //毫秒   
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}



