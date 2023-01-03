//Node Modules and Dependencies
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const puppeteer = require('puppeteer');
const passportLocalMongoose = require("passport-local-mongoose");
const nodemailer = require('nodemailer');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const http = require("http");
const ejs = require('ejs');
const fs = require('fs');
const WooCommerceAPI = require('woocommerce-api');
require("dotenv").config();
const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
const server = http.createServer(app);

//Session & Cookie Management Plugging in
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
}));

//Passport (Authorization Module) Plugging in
app.use(passport.initialize());
app.use(passport.session());

/*
Mongoose Connection URL
- Use 'mongodb://127.0.0.1:27017/advoDB' for local installation of MongoDB
- Use process.env.DB_URI for MongoDB hosted on Atlas or Cosmos
- Define DB_URI in the .env file, where it's value has to be the connection URL provided by MongoDB Atlas Cluster.
*/
mongoose.connect(process.env.DB_URI);

var WooCommerce = new WooCommerceAPI({
    url: 'https://startupkro.com',
    consumerKey: process.env.CONSUMERKEY,
    consumerSecret: process.env.CONSUMERSEC,
    wpAPI: true,
    version: 'wc/v3'
});

// WooCommerce.getAsync('products').then(function(result) {
//   console.log(JSON.parse(result.toJSON().body).length);
// });

// WooCommerce.getAsync('payment_gateways').then(function (result) {
//     console.log(JSON.parse(result.toJSON().body));
// });

// WooCommerce.getAsync('customers?email=anshgoyal1704@gmail.com').then(function(result) {
//   console.log(JSON.parse(result.toJSON().body));
// });

//User Schema for MongoDB (Mongoose)

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    googleId: String,
});

const tokenSchema = new mongoose.Schema({
    tokenId: String,
});

var ProductID = new function () {
    this.getID = function ({ form_name, city }) {
        if (form_name === "Pvt Reg") {
            return 2245;
        }
        return 0;
    };
};

async function generatePdf(html) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true
    });
    await browser.close();
    return pdf;
}

var pdfName;
var filePath;
var pdfD;

async function savePdf(pdf, html, email) {
    var rndm = Math.random();
    pdfName = rndm + "_pdf";
    await fs.writeFileSync('pdfs/' + pdfName + '.pdf', pdf);
    filePath = path.join(__dirname, 'pdfs', pdfName + '.pdf');
    pdfD = fs.readFileSync(filePath);

    await emailClient.sendMail({
        from: 'no-reply-q@startupkro.com',
        to: email,
        subject: "Your quotation from StartupKro is here",
        text: "Your quotation is here",
        html: html,
        attachments: [
            {
                filename: 'Quotation.pdf',
                content: pdfD,
            },
        ],
    });
    fs.unlinkSync(filePath);
}

const emailClient = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
    },
});

//Plugging in Mongoose Plugin for Passport
userSchema.plugin(passportLocalMongoose);

//Plugging in findOrCreate helper module for Mongoose to create or find user object
userSchema.plugin(findOrCreate);

//Compiling User Schema into User Model
const User = new mongoose.model("User", userSchema);

const Token = new mongoose.model("Token", tokenSchema);

//tok.save();

//Plugging in Passport User Creation Strategy
passport.use(User.createStrategy());

//Persisting user data into session and cookies (After successful authentication)
passport.serializeUser(function (user, done) {
    done(null, user.id);
});

//Retrieving user data from saved session and cookies
passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

//Plugging in Gooogle OAuth2.0 Authentication Strategy and adding Client ID, Cliet Secret and Callback URL.
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/keepclone",
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
    passReqToCallback: true
},
    function (request, accessToken, refreshToken, profile, done) {
        //Creating User object if not found already inside the database
        User.findOrCreate({ googleId: profile.id }, function (err, user) {
            return done(err, user);
        });
    }
));



//Get request for "/" route
app.get("/", function (req, res) {
    res.render("home");
});

//Get request for "/login" route
app.get("/login", function (req, res) {
    //Check if user is authenticated
    if (req.isAuthenticated()) {
        //Redirect to "/courses" page if user is logged-in
        res.redirect("/create-quote");
    }
    else {
        //Render "login" page if user is not logged-in.
        res.render("login");
    }
});

//Get request for "/register" route
app.get("/register", function (req, res) {
    //Check if user is authenticated
    if (req.isAuthenticated()) {
        //Redirect to "/courses" page if user is logged-in
        res.redirect("/create-quote");
    }
    else {
        //Render "register" page if user is not logged-in.
        res.render("register");
    }
});

//Get request for "/logout" route
app.get("/logout", function (req, res) {
    req.logout(function (err) {
        if (err) {
            console.log(err);
        }
        else {
            res.redirect("/");
        }
    });
});

//Get reqest for "/contact" route
app.get("/contact", function (req, res) {
    res.render("contact");
});

//Post request for "/register" route
app.post("/register", async function (req, res) {
    const name = req.body.name;
    const tokenExist = await Token.find({ tokenId: req.body.token });
    if (tokenExist.length > 0) {
        User.register({ username: req.body.username }, req.body.password, function (err, user) {
            if (err) {
                console.log(err);
                res.redirect("/register");
            }
            else {
                //Saving session cookies after successful registration
                passport.authenticate("local")(req, res, function () {
                    //Find and update name of the user into database (Naming is required for Chat Rooms).
                    User.findOneAndUpdate({ _id: req.user.id }, { $set: { name: name } }, function (err) {
                        if (!err) {
                            //Redirect to "/courses" page after successful registration
                            res.redirect("/create-quote");
                        }
                    });
                });
            }
        });
    }
    else {
        res.redirect("/register");
    }
});

//Post request for "/login" route
app.post("/login", async function (req, res) {
    //Create user object from the login form data
    const user = new User({
        username: req.body.username,
        password: req.body.password,
    });
    const userExist = await User.find({ username: req.body.username });
    const tokenExist = await Token.find({ tokenId: req.body.token });
    if (userExist.length <= 0 || tokenExist.length <= 0) {
        res.redirect("/register");
    }
    else {
        req.login(user, function (err) {
            if (err) {
                console.log(err);
            }
            else {
                //If user is found in database, save the login session and redirect to "/courses" page
                passport.authenticate("local")(req, res, function () {
                    res.redirect("/create-quote");
                });
            }
        });
    }

});

var email;
var phoneNumber;
var name;
var city;
var form_name;
var product_id;
var customerData;
var createdOrderData;
var paymentLink;
var quotData;

app.post("/quot-data", function (req, res) {
    console.log(req.body);
    email = req.body.Email;
    phoneNumber = req.body.Number;
    name = req.body.Name;
    city = req.body.City;
    form_name = req.body.form_name;
    product_id = ProductID.getID({ form_name, city });
    WooCommerce.getAsync('customers?email=' + email).then(function (result) {
        customerData = JSON.parse(result.toJSON().body);
        if (customerData.length === 0) {
            var newCustomerData = {
                email: email,
                first_name: name,
                billing: {
                    first_name: name,
                    city: city,
                    email: email,
                    phone: phoneNumber,
                },
                shipping: {
                    first_name: name,
                    city: city,
                }
            };
            WooCommerce.postAsync('customers', newCustomerData).then(function (result) {
                console.log(JSON.parse(result.toJSON().body));
            });
        }
        const newOrderData = {
            payment_method: "razorpay",
            payment_method_title: "Credit Card/Debit Card/NetBanking",
            set_paid: false,
            billing: {
                first_name: name,
                city: city,
                email: email,
                phone: phoneNumber
            },
            shipping: {
                first_name: name,
                city: city,
            },
            line_items: [
                {
                    product_id: product_id,
                    quantity: 1
                }
            ]
        };
        WooCommerce.postAsync('orders', newOrderData).then(function (result) {
            createdOrderData = JSON.parse(result.toJSON().body);
            console.log(createdOrderData);
            paymentLink = createdOrderData.payment_url;
            quotData = {
                name: name,
                city: city,
                phone: phoneNumber,
                id: createdOrderData.id,
                date: createdOrderData.date_created,
                products: createdOrderData.line_items,
                total: createdOrderData.total,
                link: paymentLink,
            };
            console.log(quotData);
            res.redirect("/generatepdf");
        });
        //////////////////////////////////////////

    });

});

// quotData = {
//     name: "Ansh",
//     city: "Rohtak",
//     phone: "7494909769",
//     id: 123,
//     date: "12-12-12",
//     products: [],
//     total: 1234,
//     link: "https://google.com",
// };

app.get("/generatepdf", async function (req, res) {
    const filePath = path.join(__dirname, 'views', 'layout.ejs');
    var htmlData = await ejs.renderFile(filePath, { qdata: quotData });
    //console.log(htmlData);
    var pdf = await generatePdf(htmlData);
    await savePdf(pdf, htmlData, email);
    res.redirect("/success");
});

app.get("/success", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("success");
    }
    else {
        res.redirect("/login");
    }
});

app.get("/create-quote", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("create-quote");
    }
    else {
        res.redirect("/login");
    }
});

app.post("/create-quote", async function (req, res) {
    if (req.isAuthenticated()) {
        var prodArr = req.body.productNames.replace(/\r/g, "").split(/\n/);
        var priceArr = req.body.productPrices.replace(/\r/g, "").split(/\n/);
        for (var i = 0; i < prodArr.length; i++) {
            prodArr[i] = prodArr[i].trim();
            priceArr[i] = priceArr[i].trim();
        }
        console.log(prodArr, priceArr);
        const prodData = {
            name: "",
            type: 'simple',
            regular_price: "",
        }

        const prodIds = [];

        for (var i = 0; i < prodArr.length; i++) {
            prodData.name = prodArr[i];
            prodData.regular_price = priceArr[i];
            console.log(prodData.name, prodData.regular_price);
            await WooCommerce.postAsync('products', prodData).then(function (result) {
                console.log(JSON.parse(result.toJSON().body));
                prodIds.push(JSON.parse(result.toJSON().body).id);
            });
        }

        console.log(prodIds);

        email = req.body.email;
        phoneNumber = req.body.number;
        name = req.body.name;
        city = req.body.city;

        WooCommerce.getAsync('customers?email=' + email).then(function (result) {
            customerData = JSON.parse(result.toJSON().body);
            if (customerData.length === 0) {
                var newCustomerData = {
                    email: email,
                    first_name: name,
                    billing: {
                        first_name: name,
                        city: city,
                        email: email,
                        phone: phoneNumber,
                    },
                    shipping: {
                        first_name: name,
                        city: city,
                    }
                };
                WooCommerce.postAsync('customers', newCustomerData).then(function (result) {
                    console.log(JSON.parse(result.toJSON().body));
                });
            }
            const newOrderData = {
                payment_method: "razorpay",
                payment_method_title: "Credit Card/Debit Card/NetBanking",
                set_paid: false,
                billing: {
                    first_name: name,
                    city: city,
                    email: email,
                    phone: phoneNumber
                },
                shipping: {
                    first_name: name,
                    city: city,
                },
                line_items: []
            };

            for (var i = 0; i < prodIds.length; i++) {
                var prod = {
                    product_id: prodIds[i],
                    quantity: 1
                };
                newOrderData.line_items.push(prod);
            }
            console.log(newOrderData);
            WooCommerce.postAsync('orders', newOrderData).then(function (result) {
                createdOrderData = JSON.parse(result.toJSON().body);
                console.log(createdOrderData);
                paymentLink = createdOrderData.payment_url;
                quotData = {
                    name: name,
                    city: city,
                    phone: phoneNumber,
                    id: createdOrderData.id,
                    date: createdOrderData.date_created,
                    products: createdOrderData.line_items,
                    total: createdOrderData.total,
                    link: paymentLink,
                };
                res.redirect("/generatepdf");
            });

            //////////////////////////////////////////

        });
    }
    else {
        res.redirect("/login");
    }
});

//3000 for localhost (127.0.0.1) and dynamic port for Heroku and other Node.JS services
const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
    console.log("App successfully spinned up on port 3000");
});

