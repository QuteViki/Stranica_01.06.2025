const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;
const API_KEY = "517a3a0bcfe3f9985901d30285856883";

app.use(cors());

//  Serve static files like CSS/JS if needed
app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/autotrolej/linije", async (req, res) => {
  try {
    const response = await axios.get(
      "http://e-usluge2.rijeka.hr/OpenData/ATlinije.json",
      {
        responseType: "text",
      }
    );
    const rawData = response.data;
    console.log("Dohvaćena veličina:", rawData.length);

    // Parsiranje JSON-a
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch (e) {
      console.error("Ne mogu parsirati JSON:", e.message);
      return res.status(500).json({ poruka: "Pogreška pri parsiranju JSON-a" });
    }
    console.log("Parsed lines:", parsed.length);

    // Ovdje koristiš parsirani JSON, ne response.data
    const sveLinije = parsed;
    console.log("Ukupno linija:", sveLinije.length);

    const filtrirane = sveLinije.filter((linija) => {
      const naziv = (linija.NazivVarijanteLinije || "").toLowerCase();
      const smjer = (linija.Smjer || "").toUpperCase();
      return naziv.includes("rijeka") && smjer === "A";
    });
    // .slice(100, 150); // uzmi 50 linija od 100. do 149.

    console.log(`Nađeno linija: ${filtrirane.length}`);

    // Uklanjanje duplikata po BrojLinije + NazivVarijanteLinije
    const uniqueMap = new Map();
    filtrirane.forEach((linija) => {
      const key = `${linija.BrojLinije}-${linija.NazivVarijanteLinije}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, linija);
      }
    });

    const uniqueLinije = Array.from(uniqueMap.values());

    res.json(uniqueLinije);
  } catch (error) {
    console.error("Greška kod dohvaćanja autobusnih linija:", error.message);
    res.status(500).json({ poruka: "Greška kod dohvaćanja linija." });
  }
});

//  Parking
app.get("/dostupnost", async (req, res) => {
  try {
    const response = await axios.get(
      "https://www.rijeka-plus.hr/wp-json/restAPI/v1/parkingAPI"
    );
    res.json(response.data);
  } catch (error) {
    console.error("Greška dohvata parking API:", error.message);
    res.status(500).send("Greška kod dohvata sadržaja");
  }
});

//  Trenutno vrijeme
app.get("/vrijeme", async (req, res) => {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=Rijeka&appid=${API_KEY}&units=metric`;

  try {
    const odgovor = await axios.get(url);
    const podaci = odgovor.data;

    res.json({
      grad: podaci.name,
      temperatura: podaci.main.temp.toFixed(1),
      uvjeti: podaci.weather[0].description,
      ikona: `https://openweathermap.org/img/wn/${podaci.weather[0].icon}.png`,
    });
  } catch (error) {
    console.error("Greška dohvata trenutnog vremena:", error.message);
    res.status(500).json({ poruka: "Greška kod dohvaćanja vremena." });
  }
});

// 3-dnevna prognoza
app.get("/prognoza3", async (req, res) => {
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=Rijeka&appid=${API_KEY}&units=metric`;

  try {
    const odgovor = await axios.get(url);
    const lista = odgovor.data.list;

    const dnevnaPrognoza = {};

    lista.forEach((entry) => {
      const [datum, sat] = entry.dt_txt.split(" ");
      if (sat === "12:00:00" && !dnevnaPrognoza[datum]) {
        dnevnaPrognoza[datum] = {
          datum,
          temperatura: entry.main.temp.toFixed(1),
          uvjeti: entry.weather[0].description,
          ikona: `https://openweathermap.org/img/wn/${entry.weather[0].icon}.png`,
        };
      }
    });

    res.json(Object.values(dnevnaPrognoza).slice(0, 3));
  } catch (error) {
    console.error("Greška kod 3-dnevne prognoze:", error.message);
    res.status(500).json({ poruka: "Greška kod dohvaćanja prognoze." });
  }
});

// HAK
app.get("/promet", async (req, res) => {
  try {
    const response = await axios.get(
      "https://www.hak.hr/info/stanje-na-cestama"
    );
    const $ = cheerio.load(response.data);

    let rezultati = [];

    $("div.alert, div.info, p").each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes("Rijeka")) {
        rezultati.push(text);
      }
    });

    res.json(rezultati);
  } catch (err) {
    console.error("Greška kod dohvaćanja prometa:", err.message);
    res.status(500).json({ poruka: "Greška kod dohvaćanja prometa." });
  }
});

// Trgovine
app.get("/trgovine", async (req, res) => {
  try {
    const response = await axios.get(
      "https://servisdigital.hr/hr/rijeka-radno-vrijeme-trgovina-otvorenih-u-nedjelju/"
    );
    const $ = cheerio.load(response.data);

    let rezultati = [];
    let linkovi = [];

    // Izdvoji tekstualne informacije (kao dosad)
    $("div.alert, div.info, p").each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes("Rijeka")) {
        rezultati.push(text);
      }
    });

    // Izdvoji linkove ispod teksta "Za više informacija..."
    $("a").each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");

      const nazivi = [
        "NTL",
        "Plodine",
        "Lidl",
        "Konzum",
        "Studenac",
        "Eurospin",
      ];

      // Ako naziv linka odgovara nekom iz popisa
      if (nazivi.some((naziv) => text.includes(naziv))) {
        linkovi.push({ naziv: text, url: href });
      }
    });

    res.json({ trgovine: rezultati, linkovi });
  } catch (err) {
    console.error("Greška kod dohvaćanja trgovina:", err.message);
    res
      .status(500)
      .json({ poruka: "Greška kod dohvaćanja otvorenih trgovina." });
  }
});

//rijecki tunel

app.get("/scrape-paragraphs", async (req, res) => {
  try {
    const response = await axios.get("https://visitrijeka.hr/rijecki-tunel/");
    const $ = cheerio.load(response.data);

    const unwantedPatterns = [
      "newsletter",
      "©",
      "Prijavite se",
      "Turistička zajednica",
      "Studio Web Art",
      "Grivica",
      "PON",
      "Prilagodba",
      "Cjenik ulaznica dostupan u tablici.",
    ];

    const paragraphs = $("p")
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((text) => {
        // Remove empty lines or lines containing unwanted patterns
        return (
          text &&
          !unwantedPatterns.some((pattern) =>
            text.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      });

    res.json(paragraphs);
  } catch (error) {
    console.error("Greška kod scrape-a:", error.message);
    res.status(500).json({ poruka: "Neuspješan scrape." });
  }
});

// Trsat

app.get("/scrape-paragraphs-trsat", async (req, res) => {
  try {
    const response = await axios.get(
      "https://visitrijeka.hr/ljeto-na-gradini/"
    );
    const $ = cheerio.load(response.data);

    const unwantedPatterns = [
      "U nastavku donosimo program koji je podložan promjenama. Hvala na razumijevanju.",
      "Ljeto ispravljeno",
      "Turistička zajednica",
      "Studio Web Art",
      "Prilagodba",
      "Program u prilog, a isti može biti podložan podložan. Zahvaljujemo na razumijevanju.",
      "Prijavite se na naš newsletter",
    ];

    const paragraphs = $("p")
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((text) => {
        // Remove empty lines or lines containing unwanted patterns
        return (
          text &&
          !unwantedPatterns.some((pattern) =>
            text.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      });

    res.json(paragraphs);
  } catch (error) {
    console.error("Greška kod scrape-a:", error.message);
    res.status(500).json({ poruka: "Neuspješan scrape." });
  }
});

//Korzo

app.get("/scrape-paragraphs-korzo", async (req, res) => {
  try {
    const response = await axios.get("https://visitrijeka.hr/korzo/");
    const $ = cheerio.load(response.data);

    const unwantedPatterns = [
      "Turistička zajednica",
      "Studio Web Art",
      "Prilagodba",
      "Prijavite se na naš newsletter",
    ];

    const paragraphs = $("p")
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((text) => {
        // Remove empty lines or lines containing unwanted patterns
        return (
          text &&
          !unwantedPatterns.some((pattern) =>
            text.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      });

    res.json(paragraphs);
  } catch (error) {
    console.error("Greška kod scrape-a:", error.message);
    res.status(500).json({ poruka: "Neuspješan scrape." });
  }
});

// Stari grad

app.get("/scrape-paragraphs-starigrad", async (req, res) => {
  try {
    const response = await axios.get("https://visitrijeka.hr/stari-grad/");
    const $ = cheerio.load(response.data);

    const unwantedPatterns = [
      "Turistička zajednica",
      "Studio Web Art",
      "Prilagodba",
      "Prijavite se na naš newsletter",
    ];

    const paragraphs = $("p")
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((text) => {
        // Remove empty lines or lines containing unwanted patterns
        return (
          text &&
          !unwantedPatterns.some((pattern) =>
            text.toLowerCase().includes(pattern.toLowerCase())
          )
        );
      });

    res.json(paragraphs);
  } catch (error) {
    console.error("Greška kod scrape-a:", error.message);
    res.status(500).json({ poruka: "Neuspješan scrape." });
  }
});

//simulacija apija za restorane
app.get("/api/restorani", (req, res) => {
  const podaci = path.join(__dirname, "restorani.json");

  fs.readFile(podaci, "utf8", (err, data) => {
    if (err) {
      console.error("Greška kod čitanja restorani.json:", err.message);
      return res.status(500).json({ poruka: "Greška kod čitanja podataka." });
    }

    try {
      const restorani = JSON.parse(data);
      res.json(restorani);
    } catch (parseErr) {
      console.error("Greška kod parsiranja restorani.json:", parseErr.message);
      res.status(500).json({ poruka: "Greška kod parsiranja podataka." });
    }
  });
});

// Pokretanje servera
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
