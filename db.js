import mysql from 'mysql2'

//to make single connection we can use createConnection keyword..but in here i create pool of connections
const db = mysql.createPool({
    host:"localhost",
    user:"root",
    password:"",
    database:"express_db",
    port:3306
});

//in here due to i use createPool in below function i have to use db.getConnection function
//if is create createConnection in below function, then i have to use db.connect function
db.getConnection((err)=>{
    if(err){
        console.error("mysql connection failed", err);
        return;
    }
    console.log("mysql connected");
});

export default db;

