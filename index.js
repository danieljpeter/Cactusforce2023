/**
 * Receives a payload and returns information about it.
 *
 * The exported method is the entry point for your code when the function is invoked.
 *
 * Following parameters are pre-configured and provided to your function on execution:
 * @param event: represents the data associated with the occurrence of an event, and
 *                 supporting metadata about the source of that occurrence.
 * @param context: represents the connection to Functions and your Salesforce org.
 * @param logger: logging handler used to capture application logs and trace specifically
 *                 to a given execution of a function.
 */
 import CanvasTablePackage from "canvas-table";
 const { CanvasTable, CTConfig } = CanvasTablePackage;
 import { createCanvas } from "canvas";
 import ImageCharts from 'image-charts'
 import Slack from "@slack/web-api";
 import csv from "csvtojson";
 const WebClient = Slack.WebClient;
 
 /**
  * Returns the percent of people in each age band
  * @param {Array} rows
  * @returns {Object} Each band and the percent of users in the census in that band
  */
 function getAgePercents(rows) {
   const numAgeBand = { band1: 0, band2: 0, band3: 0 }
   rows.forEach((row) => {
     const age = Math.abs((new Date(Date.now() - new Date(row.dob)).getUTCFullYear() - 1970))
     row.age = age
     if (age < 40) {
       numAgeBand.band1++
     } else if (age < 60) {
       numAgeBand.band2++
     } else {
       numAgeBand.band3++
     }
   })
   return {
     band1: numAgeBand.band1/rows.length,
     band2: numAgeBand.band2/rows.length,
     band3: numAgeBand.band3/rows.length
   }
 }
 
 /**
  * Returns the rate multiplier for each age band
  * @param {Array} rows 
  * @returns {Object} Multipliers for calculating rates
  */
 function getMultipliers (rows) {
   const agePercents = getAgePercents(rows)
   return { 
     band1: 1 + (agePercents.band1 / 3),
     band2: 1 + (agePercents.band2 / 3),
     band3: 1 + (agePercents.band3 / 3)
   }
 }
 
 /**
  * Given a list of users from a census, returns the quote for the users
  * @param {Array} rows 
  * @returns {Object} Each age band and quoted rates for different plans
  */
 function getQuote (rows) {
   const ageMults = { band1: 1, band2: 3, band3: 6 }
   const mults = getMultipliers(rows)
 
   const band1Major = 3
   const band1Sig = band1Major * 3
   const band1Small = band1Major * 5
 
   const ints = {
     band1: { small: band1Small, sig: band1Sig, major: band1Major },
     band2: { small: band1Small * ageMults.band2, sig: band1Sig * ageMults.band2, major: band1Major * ageMults.band2},
     band3: { small: band1Small * ageMults.band3, sig: band1Sig * ageMults.band3, major: band1Major * ageMults.band3}
   }
 
   return {
     band1: { "Age Range": '< 40', Small: parseFloat(ints.band1.small * mults.band1).toFixed(2).toString(), Significant: parseFloat(ints.band1.sig * mults.band1).toFixed(2).toString(), Major: parseFloat(ints.band1.major * mults.band1).toFixed(2).toString() },
     band2: { "Age Range": '40-59', Small: parseFloat(ints.band2.small * mults.band2).toFixed(2).toString(), Significant: parseFloat(ints.band2.sig * mults.band2).toFixed(2).toString(), Major: parseFloat(ints.band2.major * mults.band2).toFixed(2).toString() },
     band3: { "Age Range": '60+', Small: parseFloat(ints.band3.small * mults.band3).toFixed(2).toString(), Significant: parseFloat(ints.band3.sig * mults.band3).toFixed(2).toString(), Major: parseFloat(ints.band3.major * mults.band3).toFixed(2).toString() }
   }
 }
 
 /**
  * Given the rows of users, returns a buffer for an image for a table
  * @param {Array} rows 
  * @returns {Buffer?} Buffer for the image
  */
 async function csvToImage (rows) {
   // Width X Height
   const canvas = createCanvas(275, 200)
   const columns = Object.keys(rows[0]).map((key) => {
     return { 
       title: key,
       options: {
         textAlign: 'center',
       }
     }
   });
   const canvasData = rows.map((row) => Object.values(row))
   const options = {
     title: {
       text: 'Base Plan Rates',
       fontWeight: 'bold',
       color: '#0777d0',
       textAlign: 'left'
     },
     subtitle: {
       text: 'Monthly rates per $1000 of benefit that are\nused to calculate the illustrated premiums above',
       fontSize: '8',
       textAlign: 'left'
     }
   }
   const config = { columns, data: canvasData, options }
   const ct = new CanvasTable(canvas, config)
   await ct.generateTable()
   return ct.renderToBuffer("test.png");
 }
 
 /**
  * Given the rows of users, generates a chart to visualize the breakdown of ages
  * @param {Array} rows 
  * @returns {Buffer??} Buffer for an image of a chart
  */
 async function generateChart (rows) {
   const percents = getAgePercents(rows)
   const pieChart = await ImageCharts()
     .cht('p') // p for pie chart
     .chd(`a:${percents.band1},${percents.band2},${percents.band3}`) //this is the data
     .chl(`< 40\n${parseFloat(percents.band1 * 100).toFixed(2)}%|40-59\n${parseFloat(percents.band2 * 100).toFixed(2)}%|60+\n${parseFloat(percents.band3 * 100).toFixed(2)}%`)
     .chs('250x250') // chart size
   return pieChart.toBuffer()
 }
 
 /**
  * Given a list of channels and a file as a buffer, uploads the file to slack and sends a message
  * with the file attached to the specified channels
  * @param {String} channels comma separated String of Slack channel IDs
  * @param {Buffer??} file Buffer of the file to be sent to Slack
  */
 async function uploadFileToSlack(channels, file, token, message) {
   try {
     const slackClient = new WebClient(token);
     const { file: slackFile } = await slackClient.files.upload({
       file,
       filename: "csvImage",
     });
     return slackFile
   } catch (err) {
     console.error('slack_file_upload_error', err)
   }
 }
 
 export default async function (event, context, logger) {
   try {
    const data = event.data || {};
    logger.info(
      `**** Invoking invocationeventjs with payload ${JSON.stringify(data)}`
      );
      
      logger.info(`**** context ${JSON.stringify(context)}`);
      
      // Initialize the slack client with the token passed through to the function
      const slackClient = new WebClient(data.token);
      // Get the file sent to slack using the passed through file ID
     const { content: fileContent } = await slackClient.files.info({
       file: data.fileid
     }); //file id
     console.log(fileContent);
     const census = {
       type: "Census__c",
       fields: {
         Body__c: fileContent,
         Slack_File_Id__C: data.fileid
       }
     };
     const uows = [];
     let curUow = context.org.dataApi.newUnitOfWork();
     const response = await context.org.dataApi.create(census);
     const censusId = response.id;
     const rows = await csv().fromString(fileContent);
     rows.forEach((person) => {
       if (curUow._subrequests.length >= 500) {
         uows.push(curUow);
         curUow = context.org.dataApi.newUnitOfWork();
       }
       const censusRow = {
         type: "Census_Line__c",
         fields: {
           Census__c: censusId,
           First_Name__c: person.first_name,
           Last_Name__c: person.last_name,
           Email__c: person.email,
           Gender__c: person.gender,
           Date_of_Birth__c: new Date(person.dob),
           State__c: person.state
         }
       };
       curUow.registerCreate(censusRow);
     });
     uows.push(curUow);
     for (const uow of uows) {
       const response = await context.org.dataApi.commitUnitOfWork(uow);
       logger.info(
         `**** context.org.dataApi.create ${JSON.stringify(response)}`
       );
     }
     // create image
     const prices = getQuote(rows)
     const chartBuffer = await csvToImage(Object.values(prices))
     const chartFile = await uploadFileToSlack("C042EDM60AV", chartBuffer, data.token, 'Here is your chart!');
     const graph = await generateChart(rows)
     const graphFile = await uploadFileToSlack("C042EDM60AV", graph, data.token, 'Here is your graph!')
     await slackClient.chat.postMessage({
       channel: 'C041GF7ALLT',
       text: `Here are your files!\n<${chartFile.permalink}| > <${graphFile.permalink}| >`,
       thread_ts: data.ts
     })
   } catch (err) {
     const errorMessage = `Slack Function failed : ${err.message}`;
     logger.error(errorMessage);
     throw new Error(errorMessage);
   }
   return "This message came from inside a Salesforce Function!!";
 }
 
