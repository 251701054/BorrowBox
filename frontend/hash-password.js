
const bcrypt = require("bcrypt");

async function main() {
    const password = "ChangeThisPassword123!";
    const hash = await bcrypt.hash(password, 12);

    console.log("Password hash:");
    console.log(hash);
}

main().catch(console.error);
