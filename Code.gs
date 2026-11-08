// ========================================================
// 🏥 DU THUNG SMART EWS - รพ.สต.ดู่ทุ่ง (ฉบับรองรับปีงบประมาณ 2568-2569)
// ========================================================

// 1. กุญแจเชื่อมต่อ LINE Messaging API (Token ของคุณหญิง)
const LINE_CHANNEL_ACCESS_TOKEN = "O0cDyU3R77uyucABdpt02IIvL9dJT3ryuL8tdO02KT7fkIwkFKT5qVmD3ZDB+iU0Sbf5uZlOkc+jD0iXne97QtJ/SZz1hn6VLyAOI8q2iS40PqjUXkgaSyUSyOco10ds1BHjzsvF2FKrYbPurRu3xwdB04t89/1O/w1cDnyilFU=";
const LINE_NOTIFY_TOKEN = "ใส่_LINE_TOKEN_ตรงนี้_ถ้ามี"; 

// 2. แผนที่ชื่อหมู่บ้านจริง
const VILLAGE_NAMES = {
  "2": "บ้านดู่ทุ่ง",
  "3": "บ้านหนองคำ",
  "4": "บ้านพลับ",
  "6": "บ้านคำบอน",
  "10": "บ้านดู่ทุ่ง"
};

// --------------------------------------------------------
// 🌟 ฟังก์ชันคำนวณปีงบประมาณ (ตัดรอบ 1 ต.ค. - 30 ก.ย.)
// --------------------------------------------------------
function getFiscalYear(dateInput) {
  if (!dateInput) return "";
  var d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  var month = d.getMonth(); // 0 = ม.ค., 8 = ก.ย., 9 = ต.ค., 11 = ธ.ค.
  var yearBE = d.getFullYear() + 543;

  // เดือนตุลาคม (เดือน 9) เป็นต้นไป ปรับเป็นปีงบประมาณถัดไป
  if (month >= 9) {
    yearBE += 1;
  }
  return yearBE.toString();
}

// 3. ฟังก์ชันแสดงหน้าเว็บ (doGet)
function doGet(e) {
  var villageParam = (e && e.parameter && e.parameter.v) ? e.parameter.v : "";
  var template = HtmlService.createTemplateFromFile("index");
  template.villageDefault = villageParam;
  
  return template.evaluate()
    .setTitle("DU THUNG SMART EWS - รพ.สต.ดู่ทุ่ง")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 4. ฟังก์ชัน LINE Bot Webhook ดักจับข้อความและชื่อไฟล์ (doPost)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return;
    
    var json = JSON.parse(e.postData.contents);
    var events = json.events;
    if (!events || events.length === 0) return;

    var event = events[0];
    var replyToken = event.replyToken;
    
    // 🌟 ดึงข้อมูลได้ทั้งข้อความตัวหนังสือ หรือ "ชื่อไฟล์ PDF" ที่ส่งเข้ามา
    var userMsg = "";
    if (event.message) {
      if (event.message.type === "text") {
        userMsg = event.message.text || "";
      } else if (event.message.type === "file") {
        userMsg = event.message.fileName || ""; // อ่านชื่อไฟล์ เช่น HFM ต.ดู่ทุ่ง.pdf
      }
    }

    // ตรวจจับข้อความหรือชื่อไฟล์ที่มีคำว่า "ดู่ทุ่ง"
    if (userMsg.includes("ดู่ทุ่ง")) {
      var detectedCases = parseHospitalReport(userMsg);

      if (detectedCases.length > 0) {
        var replyText = "🚨 DU THUNG SMART EWS\n";
        replyText += "---------------------------\n";
        replyText += "✅ ตรวจพบรายงานผู้ป่วยจาก รพ.ยโสธร!\n\n";

        detectedCases.forEach(function(item) {
          var caseId = saveAutoLineCase(item.disease, item.count);
          replyText += `• โรค: ${item.disease} (${item.count} ราย)\n`;
          replyText += `  รหัสเคส: ${caseId}\n`;
          replyText += `  สถานะ: 🟡 รอระบุหมู่บ้าน/สอบสวนโรค\n\n`;
        });

        replyText += "👉 ข้อมูลถูกบันทึกเข้าแดชบอร์ดแล้ว ทีม SRRT สามารถกดปุ่ม '✏️ แก้ไข' เพื่อระบุหมู่บ้านและชื่อผู้ป่วยหลังทราบข้อมูลเพิ่มเติมได้เลยค่ะ";
        sendLineReply(replyToken, replyText);
      } else {
        sendLineReply(replyToken, "ตรวจพบคำว่า 'ดู่ทุ่ง' แต่ไม่สามารถระบุกลุ่มโรคได้ กรุณาตรวจสอบชื่อไฟล์หรือข้อความค่ะ");
      }
    }
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
  }
}

// 5. สมองกลแกะข้อความ/ชื่อไฟล์จาก รพ.ยโสธร (เพิ่มคำย่อ HFM)
function parseHospitalReport(text) {
  var lines = text.split("\n");
  var results = [];

  lines.forEach(function(line) {
    if (line.includes("ดู่ทุ่ง")) {
      var disease = "โรคติดต่อเฝ้าระวัง";
      var upper = line.toUpperCase();
      
      if (upper.includes("RSV")) disease = "RSV";
      else if (upper.includes("FLU") || line.includes("หวัดใหญ่")) disease = "ไข้หวัดใหญ่/ทางเดินหายใจ";
      else if (upper.includes("DENGUE") || line.includes("เลือดออก")) disease = "ไข้เลือดออก";
      else if (upper.includes("COVID") || upper.includes("โควิด")) disease = "โควิด-19";
      else if (upper.includes("TB") || line.includes("วัณโรค")) disease = "วัณโรค (TB)";
      else if (line.includes("ร่วง") || line.includes("อาหารเป็นพิษ")) disease = "อุจจาระร่วงเฉียบพลัน";
      // 🌟 รองรับคำว่า HFM หรือ มือเท้าปาก
      else if (line.includes("มือ เท้า ปาก") || line.includes("มือเท้าปาก") || upper.includes("HFMD") || upper.includes("HFM")) disease = "มือ เท้า ปาก";

      var countMatch = line.match(/(\d+)\s*ราย/);
      var count = countMatch ? parseInt(countMatch[1]) : 1;

      results.push({ disease: disease, count: count });
    }
  });

  return results;
}

// 6. เปิดเคสอัตโนมัติจากไลน์
function saveAutoLineCase(disease, count) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("tbl_cases");
  var lastRow = sheet.getLastRow();
  
  var currentYear = (new Date().getFullYear() + 543).toString().slice(-2);
  var caseRunning = ("000" + lastRow).slice(-4);
  var caseId = "DT-" + currentYear + "-" + caseRunning;
  
  var reportedDate = new Date();
  var todayStr = Utilities.formatDate(reportedDate, "Asia/Bangkok", "yyyy-MM-dd");

  var newRow = [
    caseId,
    reportedDate,
    todayStr,
    0, // 0 = ยังไม่ระบุหมู่บ้าน
    "-",
    "รอระบุชื่อ (เคสแจ้งเตือนจาก รพ.ยโสธร)",
    0,
    "ไม่ระบุ",
    disease,
    0,
    "รับแจ้งผ่านกลุ่มไลน์ควบคุมโรคอำเภอเมืองยโสธร",
    "รพ.ยโสธร (ส่งต่อรายงาน)",
    "-",
    "Pending"
  ];
  sheet.appendRow(newRow);
  return caseId;
}

// 7. ฟังก์ชันตอบกลับไลน์บอท
function sendLineReply(replyToken, messageText) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var options = {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "text", text: messageText }]
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

// 8. ฟังก์ชันบันทึกเคสจากหน้าเว็บฟอร์ม + ตรวจจับการระบาด
function savePatientCase(formObj) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("tbl_cases");
    if (!sheet) sheet = ss.insertSheet("tbl_cases");
    
    var lastRow = sheet.getLastRow();
    var currentYear = (new Date().getFullYear() + 543).toString().slice(-2);
    var caseRunning = ("000" + lastRow).slice(-4);
    var caseId = "DT-" + currentYear + "-" + caseRunning;
    var reportedDate = new Date();
    
    var villageNo = parseInt(formObj.village_no);
    var syndrome = formObj.syndrome_group;
    var onsetDate = new Date(formObj.onset_date);

    var newRow = [
      caseId, reportedDate, formObj.onset_date, villageNo,
      formObj.house_no || "-", formObj.patient_name,
      parseInt(formObj.age) || 0, formObj.gender, syndrome,
      parseFloat(formObj.temp_celsius) || 0, formObj.symptoms || "-",
      formObj.reporter_name, "'" + formObj.reporter_phone, "Pending"
    ];
    sheet.appendRow(newRow);

    var alertInfo = checkOutbreakCluster(sheet, villageNo, syndrome, onsetDate);
    
    if (LINE_NOTIFY_TOKEN && LINE_NOTIFY_TOKEN !== "ใส่_LINE_TOKEN_ตรงนี้_ถ้ามี") {
      sendLineNotification(caseId, formObj, alertInfo);
    }

    return {
      status: "success",
      message: `บันทึกข้อมูลสำเร็จ! รหัสเคส: ${caseId}` + (alertInfo.isCluster ? `\n⚠️ เตือนภัย: ${alertInfo.alertText}` : "")
    };
  } catch (error) {
    return { status: "error", message: "เกิดข้อผิดพลาด: " + error.message };
  }
}

// 9. เครื่องยนต์ตรวจจับคลัสเตอร์ (Cluster Detection)
function checkOutbreakCluster(sheet, villageNo, syndrome, currentOnsetDate) {
  var data = sheet.getDataRange().getValues();
  var matchCases = 0;
  var windowDays = 14; 
  if (syndrome === "อุจจาระร่วงเฉียบพลัน") windowDays = 3;

  var cutoffTime = currentOnsetDate.getTime() - (windowDays * 24 * 60 * 60 * 1000);
  var vName = VILLAGE_NAMES[villageNo.toString()] || "บ้านดู่ทุ่ง";

  for (var i = 1; i < data.length; i++) {
    var rowVillage = parseInt(data[i][3]);
    var rowSyndrome = data[i][8];
    var rowOnsetDate = new Date(data[i][2]).getTime();

    if (rowVillage === villageNo && rowSyndrome === syndrome && rowOnsetDate >= cutoffTime) {
      matchCases++;
    }
  }

  var isCluster = false;
  var alertText = "";

  if (syndrome === "ไข้เลือดออก" && matchCases >= 2) {
    isCluster = true;
    alertText = `🚨 คลัสเตอร์ไข้เลือดออก หมู่ ${villageNo} ${vName}! (พบ ${matchCases} ราย ใน ${windowDays} วัน)`;
  } else if (syndrome === "อุจจาระร่วงเฉียบพลัน" && matchCases >= 3) {
    isCluster = true;
    alertText = `🚨 สงสัยอาหารเป็นพิษกลุ่มก้อน หมู่ ${villageNo} ${vName}! (พบ ${matchCases} ราย ใน 3 วัน)`;
  } else if (syndrome === "มือ เท้า ปาก" && matchCases >= 2) {
    isCluster = true;
    alertText = `⚠️ เฝ้าระวังโรคมือเท้าปาก หมู่ ${villageNo} ${vName} (พบ ${matchCases} ราย)`;
  }

  return { isCluster: isCluster, alertText: alertText, count: matchCases };
}

// 10. ส่งแจ้งเตือน LINE Notify
function sendLineNotification(caseId, formObj, alertInfo) {
  var vName = VILLAGE_NAMES[formObj.village_no.toString()] || "บ้านดู่ทุ่ง";
  var msg = "\n🔔 DU THUNG SMART EWS\n--------------------------\n";
  if (alertInfo.isCluster) {
    msg += `${alertInfo.alertText}\nสถานะ: 🔴 เสี่ยงระบาดสูง (Cluster Alert)\n--------------------------\n`;
  }
  msg += `รหัสเคส: ${caseId}\nพื้นที่: หมู่ ${formObj.village_no} ${vName} ต.ดู่ทุ่ง\nโรค: ${formObj.syndrome_group}\nผู้ป่วย: ${formObj.patient_name} (${formObj.age} ปี)\nผู้แจ้ง: ${formObj.reporter_name}\n`;
  
  var options = {
    method: "post",
    headers: { "Authorization": "Bearer " + LINE_NOTIFY_TOKEN },
    payload: { "message": msg },
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);
}

// 11. ค้นหาข้อมูลย้อนหลัง + แดชบอร์ด (เพิ่มการแยกปีงบประมาณ 2568, 2569 สำหรับกราฟ)
function searchPatientCases(filter) {
  filter = filter || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("tbl_cases");
  
  var emptyResult = { 
    cases: [], 
    statsVillage: { "2": 0, "3": 0, "4": 0, "6": 0, "10": 0 }, 
    statsSyndrome: {}, 
    statsByFiscalYear: {}, 
    fiscalYearList: [],
    total: 0 
  };

  if (!sheet) return emptyResult;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return emptyResult;

  var results = [];
  var statsVillage = { "2": 0, "3": 0, "4": 0, "6": 0, "10": 0 };
  var statsSyndrome = {};
  var statsByFiscalYear = {};
  var availableYears = {};

  var filterVillage = filter.village || "";
  var filterSyndrome = filter.syndrome || "";
  var filterFiscalYear = filter.fiscalYear || ""; // เลือกดูเฉพาะปี เช่น "2568" หรือ "2569"
  var searchKeyword = (filter.keyword || "").toLowerCase().trim();

  // เดือนลำดับตามปีงบประมาณ: 10(ต.ค.) -> 09(ก.ย.)
  var fiscalMonthKeys = ["10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08", "09"];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var cId = row[0];
    var rawDate = row[2] ? new Date(row[2]) : new Date(row[1]); // วันเริ่มป่วย หรือวันที่รายงาน
    var cReported = Utilities.formatDate(new Date(row[1]), "Asia/Bangkok", "dd/MM/yyyy");
    var cOnset = Utilities.formatDate(rawDate, "Asia/Bangkok", "dd/MM/yyyy");
    var cVillage = row[3].toString();
    var cHouse = row[4];
    var cName = row[5];
    var cAge = row[6];
    var cGender = row[7];
    var cSyndrome = row[8];
    var cTemp = row[9];
    var cSymptoms = row[10];
    var cReporter = row[11];
    var cPhone = row[12];
    var cStatus = row[13];

    // คำนวณปีงบประมาณและเดือนของเคสนี้
    var caseFiscalYear = getFiscalYear(rawDate);
    var monthStr = ("0" + (rawDate.getMonth() + 1)).slice(-2);
    if (caseFiscalYear) availableYears[caseFiscalYear] = true;

    // เตรียมโครงสร้างกราฟแยกปีงบประมาณ
    if (caseFiscalYear && !statsByFiscalYear[caseFiscalYear]) {
      statsByFiscalYear[caseFiscalYear] = {
        total: 0,
        syndromes: {},
        villages: { "2": 0, "3": 0, "4": 0, "6": 0, "10": 0 },
        monthly: {}
      };
      fiscalMonthKeys.forEach(function(m) {
        statsByFiscalYear[caseFiscalYear].monthly[m] = 0;
      });
    }

    // เก็บสถิติรายปีงบประมาณ (สำหรับเปรียบเทียบในกราฟ)
    if (caseFiscalYear && statsByFiscalYear[caseFiscalYear]) {
      statsByFiscalYear[caseFiscalYear].total++;
      statsByFiscalYear[caseFiscalYear].syndromes[cSyndrome] = (statsByFiscalYear[caseFiscalYear].syndromes[cSyndrome] || 0) + 1;
      if (statsByFiscalYear[caseFiscalYear].villages[cVillage] !== undefined) {
        statsByFiscalYear[caseFiscalYear].villages[cVillage]++;
      }
      if (statsByFiscalYear[caseFiscalYear].monthly[monthStr] !== undefined) {
        statsByFiscalYear[caseFiscalYear].monthly[monthStr]++;
      }
    }

    // กรองข้อมูลตาราง
    var matchFiscalYear = (!filterFiscalYear || filterFiscalYear === caseFiscalYear);
    var matchVillage = (!filterVillage || filterVillage === cVillage);
    var matchSyndrome = (!filterSyndrome || filterSyndrome === cSyndrome);
    var matchKeyword = (!searchKeyword || 
                        cName.toLowerCase().includes(searchKeyword) || 
                        cId.toLowerCase().includes(searchKeyword) ||
                        cSymptoms.toLowerCase().includes(searchKeyword));

    if (matchFiscalYear && matchVillage && matchSyndrome && matchKeyword) {
      if (statsVillage[cVillage] !== undefined) statsVillage[cVillage]++;
      statsSyndrome[cSyndrome] = (statsSyndrome[cSyndrome] || 0) + 1;

      results.push({
        id: cId, reported: cReported, onset: cOnset, village: cVillage,
        house: cHouse, name: cName, age: cAge, gender: cGender,
        syndrome: cSyndrome, temp: cTemp, symptoms: cSymptoms,
        reporter: cReporter, phone: cPhone, status: cStatus,
        fiscalYear: caseFiscalYear
      });
    }
  }

  results.reverse();
  return {
    cases: results,
    statsVillage: statsVillage,
    statsSyndrome: statsSyndrome,
    statsByFiscalYear: statsByFiscalYear,
    fiscalYearList: Object.keys(availableYears).sort().reverse(),
    total: results.length
  };
}

// 12. ลบข้อมูลเคส
function deletePatientCase(caseId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("tbl_cases");
    if (!sheet) return { status: "error", message: "ไม่พบชีต tbl_cases" };

    var data = sheet.getDataRange().getValues();
    var rowToDelete = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === caseId) {
        rowToDelete = i + 1;
        break;
      }
    }

    if (rowToDelete > 0) {
      sheet.deleteRow(rowToDelete);
      return { status: "success", message: `ลบเคส ${caseId} เรียบร้อยแล้ว` };
    }
    return { status: "error", message: "ไม่พบรหัสเคสที่ต้องการลบ" };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

// 13. แก้ไขข้อมูลเคส
function updatePatientCase(editObj) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("tbl_cases");
    var data = sheet.getDataRange().getValues();
    var targetRow = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === editObj.case_id) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow > 0) {
      sheet.getRange(targetRow, 3).setValue(editObj.onset_date);
      sheet.getRange(targetRow, 4).setValue(parseInt(editObj.village_no));
      sheet.getRange(targetRow, 5).setValue(editObj.house_no || "-");
      sheet.getRange(targetRow, 6).setValue(editObj.patient_name);
      sheet.getRange(targetRow, 7).setValue(parseInt(editObj.age) || 0);
      sheet.getRange(targetRow, 8).setValue(editObj.gender);
      sheet.getRange(targetRow, 9).setValue(editObj.syndrome_group);
      sheet.getRange(targetRow, 10).setValue(parseFloat(editObj.temp_celsius) || 0);
      sheet.getRange(targetRow, 11).setValue(editObj.symptoms || "-");

      return { status: "success", message: `อัปเดตข้อมูลเคส ${editObj.case_id} สำเร็จ!` };
    }
    return { status: "error", message: "ไม่พบข้อมูลเคสที่ต้องการแก้ไข" };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

// 14. บันทึกรายงานสอบสวนโรคฉบับเสนอผู้บริหาร
function saveInvestigation(investData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("tbl_investigations");
    if (!sheet) {
      sheet = ss.insertSheet("tbl_investigations");
      var headers = [
        "case_id", "doc_no", "invest_date", "investigator", "director",
        "background", "invest_result", "lab_result", "env_result", 
        "actions", "outbreak_trend", "recommendations"
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#1b5e20").setFontColor("#fff").setFontWeight("bold");
    }

    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === investData.case_id) {
        rowIndex = i + 1;
        break;
      }
    }

    var rowValues = [
      investData.case_id,
      investData.doc_no || "ยส 0133.3 / -",
      investData.invest_date,
      investData.investigator || "นางสาวดวงมาลา แก้วบุญตา",
      investData.director || "นายสมชาย ลิ้มประสาท",
      investData.background,
      investData.invest_result,
      investData.lab_result,
      investData.env_result,
      investData.actions,
      investData.outbreak_trend,
      investData.recommendations
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    var caseSheet = ss.getSheetByName("tbl_cases");
    var caseData = caseSheet.getDataRange().getValues();
    for (var j = 1; j < caseData.length; j++) {
      if (caseData[j][0] === investData.case_id) {
        caseSheet.getRange(j + 1, 14).setValue("Investigated");
        break;
      }
    }

    return { status: "success", message: "บันทึกรายงานเสนอผู้บริหารสำเร็จ!" };
  } catch (err) {
    return { status: "error", message: "เกิดข้อผิดพลาด: " + err.message };
  }
}
