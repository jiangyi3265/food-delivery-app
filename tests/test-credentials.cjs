const testPassword=process.env.FOOD_TEST_PASSWORD;
if(!testPassword)throw new Error('Set FOOD_TEST_PASSWORD to the password of your isolated test database.');
const changedPassword=require('node:crypto').randomBytes(20).toString('hex');
function localDate(offset=0){const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
module.exports={testPassword,changedPassword,localDate};
