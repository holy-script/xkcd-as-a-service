const axios = require("axios").default;
const http = require("http");
const https = require("https");
const express = require("express");
const algoliasearch = require("algoliasearch");
const { urlencoded } = require("body-parser");
const MessagingResponse = require("twilio").twiml.MessagingResponse;

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const client = algoliasearch(APP_ID, API_KEY);
const index = client.initIndex("comics");

const PORT = 3301;
const app = express();
app.use(urlencoded({ extended: false }));

const setup = async() => {
    const anchor = await axios
        .get("https://xkcd.com/info.0.json")
        .then((response) => response.data.num)
        .catch((err) => console.log(err));
    let arr = [];
    for (i = 1; i <= anchor; i++) {
        if (i !== 404) {
            let c1 = await axios
                .get(`https://xkcd.com/${i}/info.0.json`, { httpsAgent })
                .then((response) => response.data)
                .catch((error) => {
                    if (error.response) {
                        // Request made and server responded
                        console.log(error.response.data);
                        console.log(error.response.status);
                        console.log(error.response.headers);
                    } else if (error.request) {
                        // The request was made but no response was received
                        console.log(error.request);
                    } else {
                        // Something happened in setting up the request that triggered an Error
                        console.log("Error", error.message);
                    }
                });
            let num = await c1["num"];
            console.log(await c1["num"], await c1["safe_title"]);
            arr.push({
                objectID: i,
                cdata: await c1,
            });
        }
    }
    index
        .saveObjects(arr)
        .then(({ objectIDs }) => {
            console.log(objectIDs);
        })
        .catch((error) => console.log(error));
    console.log("All work done! 🏆");
};

app.post("/xkcd", (request, response) => {
    const method =
        request.body.From.search("whatsapp") === -1 ? "sms" : "whatsapp";
    const from =
        method === "sms" ?
        request.body.From :
        request.body.From.match(/\+[\d]+/)[0];
    const query = request.body.Body;
    const num =
        query.split(" ").length > 1 && /[\d]+$/.test(query) ?
        parseInt(query.match(/[\d]+$/)[0], 10) - 1 :
        0;
    const searchTerms =
        num === 0 ? query : query.split(" ").slice(0, -1).join(" ");
    index
        .search(searchTerms, {
            attributesToRetrieve: ["cdata.img", "cdata.safe_title"],
            hitsPerPage: 5,
        })
        .then(({ hits }) => {
            if (!Boolean(hits.length)) {
                console.log(`No entries found for ${query} 😅`);

                const twiml = new MessagingResponse();
                const message =
                    method === "sms" ?
                    twiml.message({ to: `${from}` }) :
                    twiml.message({ to: `${method}:${from}` });
                message.body(`Please retry, no comics found for ${query} 😥`);

                response.writeHead(200, { "Content-Type": "text/xml" });
                response.end(twiml.toString());
            } else {
                console.log(hits[num].cdata.safe_title, hits[num].cdata.img);
                console.log(
                    `Received search query "${query}" from ${from} by ${method}`
                );

                const twiml = new MessagingResponse();
                const message =
                    method === "sms" ?
                    twiml.message({ to: `${from}` }) :
                    twiml.message({ to: `${method}:${from}` });
                message.body(hits[num].cdata.safe_title);
                message.media(hits[num].cdata.img);

                response.writeHead(200, { "Content-Type": "text/xml" });
                response.end(twiml.toString());
            }
        })
        .catch((err) => console.log(err));
});

const server = http.createServer(app);
server.listen(PORT, () => {
    setup().then(() =>
        console.log(`Express server listening on localhost:${PORT}`)
    );
});
