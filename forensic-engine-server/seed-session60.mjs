import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Helper to insert with UUID
async function ins(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  let count = 0;
  for (const row of rows) {
    try {
      await conn.execute(sql, cols.map(c => row[c]));
      count++;
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") continue;
      console.error(`Error inserting into ${table}:`, e.message);
    }
  }
  console.log(`[${table}] Inserted ${count}/${rows.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEDERAL LEGISLATORS
// ═══════════════════════════════════════════════════════════════════════════════
const federalLegislators = [
  { name:"Charles E. Schumer", title:"Senator", chamber:"Senate", state:"NY", district:"NY", party:"Democrat", committees:["Senate Majority Leader","Rules Committee","Finance Committee (ex officio)"], issues:["civil_rights","immigration","healthcare","consumer_protection","housing"], phone:"202-224-6542", email:"https://www.schumer.senate.gov/contact", website:"https://www.schumer.senate.gov", social:{"twitter":"@SenSchumer","facebook":"SenatorSchumer"}, influence:95 },
  { name:"Mitch McConnell", title:"Senator", chamber:"Senate", state:"KY", district:"KY", party:"Republican", committees:["Senate Minority Leader","Appropriations Committee","Agriculture Committee"], issues:["judiciary","appropriations","tax_policy"], phone:"202-224-2541", email:"https://www.mcconnell.senate.gov/public/", website:"https://www.mcconnell.senate.gov", social:{"twitter":"@McConnellPress","facebook":"mitchmcconnell"}, influence:92 },
  { name:"Richard J. Durbin", title:"Senator", chamber:"Senate", state:"IL", district:"IL", party:"Democrat", committees:["Senate Judiciary Committee - Chair","Appropriations Committee","Rules Committee"], issues:["civil_rights","criminal_justice_reform","immigration","gun_safety"], phone:"202-224-2152", email:"https://www.durbin.senate.gov/contact", website:"https://www.durbin.senate.gov", social:{"twitter":"@SenatorDurbin","facebook":"SenatorDurbin"}, influence:90 },
  { name:"Lindsey Graham", title:"Senator", chamber:"Senate", state:"SC", district:"SC", party:"Republican", committees:["Senate Judiciary Committee - Ranking Member","Appropriations Committee","Budget Committee"], issues:["judiciary","immigration","military_affairs"], phone:"202-224-5972", email:"https://www.lgraham.senate.gov/public/", website:"https://www.lgraham.senate.gov", social:{"twitter":"@LindseyGrahamSC","facebook":"SenatorLindseyGraham"}, influence:88 },
  { name:"Sheldon Whitehouse", title:"Senator", chamber:"Senate", state:"RI", district:"RI", party:"Democrat", committees:["Senate Judiciary Committee","Budget Committee","Environment and Public Works Committee"], issues:["environmental_justice","consumer_protection","courts","antitrust"], phone:"202-224-2921", email:"https://www.whitehouse.senate.gov/contact", website:"https://www.whitehouse.senate.gov", social:{"twitter":"@SenWhitehouse","facebook":"SenatorWhitehouse"}, influence:78 },
  { name:"John Cornyn", title:"Senator", chamber:"Senate", state:"TX", district:"TX", party:"Republican", committees:["Senate Judiciary Committee","Finance Committee","Intelligence Committee"], issues:["judiciary","tax_policy","border_security","healthcare"], phone:"202-224-2934", email:"https://www.cornyn.senate.gov/contact", website:"https://www.cornyn.senate.gov", social:{"twitter":"@JohnCornyn","facebook":"sen.johncornyn"}, influence:82 },
  { name:"Cory Booker", title:"Senator", chamber:"Senate", state:"NJ", district:"NJ", party:"Democrat", committees:["Senate Judiciary Committee","Agriculture Committee","Small Business Committee"], issues:["civil_rights","criminal_justice_reform","housing","food_policy"], phone:"202-224-3224", email:"https://www.booker.senate.gov/contact", website:"https://www.booker.senate.gov", social:{"twitter":"@CoryBooker","facebook":"corybooker"}, influence:80 },
  { name:"Ted Cruz", title:"Senator", chamber:"Senate", state:"TX", district:"TX", party:"Republican", committees:["Senate Judiciary Committee","Commerce Committee","Foreign Relations Committee"], issues:["judiciary","constitutional_law","immigration"], phone:"202-224-5922", email:"https://www.cruz.senate.gov/contact", website:"https://www.cruz.senate.gov", social:{"twitter":"@SenTedCruz","facebook":"SenatorTedCruz"}, influence:82 },
  { name:"Mike Lee", title:"Senator", chamber:"Senate", state:"UT", district:"UT", party:"Republican", committees:["Senate Judiciary Committee","Energy Committee","Commerce Committee"], issues:["judiciary","antitrust","constitutional_law","regulatory_reform"], phone:"202-224-5444", email:"https://www.lee.senate.gov/contact", website:"https://www.lee.senate.gov", social:{"twitter":"@SenMikeLee","facebook":"senatormikelee"}, influence:75 },
  { name:"Amy Klobuchar", title:"Senator", chamber:"Senate", state:"MN", district:"MN", party:"Democrat", committees:["Senate Judiciary Committee","Commerce Committee","Agriculture Committee"], issues:["antitrust","consumer_protection","voting_rights","healthcare"], phone:"202-224-3244", email:"https://www.klobuchar.senate.gov/contact", website:"https://www.klobuchar.senate.gov", social:{"twitter":"@amyklobuchar","facebook":"senatorklobuchar"}, influence:82 },
  { name:"Chuck Grassley", title:"Senator", chamber:"Senate", state:"IA", district:"IA", party:"Republican", committees:["Senate Judiciary Committee","Finance Committee","Budget Committee"], issues:["judiciary","tax_policy","agriculture","oversight"], phone:"202-224-3744", email:"https://www.grassley.senate.gov/contact", website:"https://www.grassley.senate.gov", social:{"twitter":"@ChuckGrassley","facebook":"senatorchuckgrassley"}, influence:80 },
  { name:"Mazie Hirono", title:"Senator", chamber:"Senate", state:"HI", district:"HI", party:"Democrat", committees:["Senate Judiciary Committee","Armed Services Committee","Energy Committee"], issues:["civil_rights","immigration","veterans_affairs","asian_american_issues"], phone:"202-224-6361", email:"https://www.hirono.senate.gov/contact", website:"https://www.hirono.senate.gov", social:{"twitter":"@MazieHirono","facebook":"senatorhirono"}, influence:72 },
  { name:"Thom Tillis", title:"Senator", chamber:"Senate", state:"NC", district:"NC", party:"Republican", committees:["Senate Judiciary Committee","Armed Services Committee","Veterans' Affairs Committee"], issues:["judiciary","veterans","military_affairs"], phone:"202-224-6342", email:"https://www.tillis.senate.gov/contact", website:"https://www.tillis.senate.gov", social:{"twitter":"@SenThomTillis","facebook":"SenatorThomTillis"}, influence:70 },
  { name:"Chris Coons", title:"Senator", chamber:"Senate", state:"DE", district:"DE", party:"Democrat", committees:["Senate Judiciary Committee","Foreign Relations Committee","Appropriations Committee"], issues:["civil_rights","foreign_affairs","judiciary"], phone:"202-224-5042", email:"https://www.coons.senate.gov/contact", website:"https://www.coons.senate.gov", social:{"twitter":"@ChrisCoons","facebook":"senatorchriscoons"}, influence:72 },
  { name:"John Kennedy", title:"Senator", chamber:"Senate", state:"LA", district:"LA", party:"Republican", committees:["Senate Judiciary Committee","Appropriations Committee","Banking Committee"], issues:["judiciary","appropriations","banking"], phone:"202-224-4623", email:"https://www.kennedy.senate.gov/contact", website:"https://www.kennedy.senate.gov", social:{"twitter":"@SenJohnKennedy","facebook":"johnkennedyforla"}, influence:70 },
  { name:"Mike Johnson", title:"Representative", chamber:"House", state:"LA", district:"LA-4", party:"Republican", committees:["Speaker of the House","House Judiciary Committee (ex officio)"], issues:["judiciary","constitutional_law","religious_liberty"], phone:"202-225-2777", email:"https://mikejohnson.house.gov/contact", website:"https://mikejohnson.house.gov", social:{"twitter":"@RepMikeJohnson","facebook":"RepMikeJohnson"}, influence:98 },
  { name:"Hakeem Jeffries", title:"Representative", chamber:"House", state:"NY", district:"NY-8", party:"Democrat", committees:["House Minority Leader","House Judiciary Committee (ex officio)"], issues:["civil_rights","criminal_justice_reform","housing"], phone:"202-225-5936", email:"https://jeffries.house.gov/contact", website:"https://jeffries.house.gov", social:{"twitter":"@RepJeffries","facebook":"RepHakeemJeffries"}, influence:95 },
  { name:"Jim Jordan", title:"Representative", chamber:"House", state:"OH", district:"OH-4", party:"Republican", committees:["House Judiciary Committee - Chairman","Select Subcommittee on the Weaponization of Government"], issues:["judiciary","oversight","constitutional_law"], phone:"202-225-2676", email:"https://jordan.house.gov/contact", website:"https://jordan.house.gov", social:{"twitter":"@Jim_Jordan","facebook":"repjimjordan"}, influence:90 },
  { name:"Jerrold Nadler", title:"Representative", chamber:"House", state:"NY", district:"NY-12", party:"Democrat", committees:["House Judiciary Committee - Ranking Member","Transportation Committee"], issues:["civil_rights","immigration","judiciary","transportation"], phone:"202-225-5635", email:"https://nadler.house.gov/contact", website:"https://nadler.house.gov", social:{"twitter":"@RepJerroldNadler","facebook":"CongressmanJerroldNadler"}, influence:85 },
  { name:"Pramila Jayapal", title:"Representative", chamber:"House", state:"WA", district:"WA-7", party:"Democrat", committees:["House Judiciary Committee","Budget Committee"], issues:["immigration","civil_rights","healthcare","workers_rights"], phone:"202-225-3106", email:"https://jayapal.house.gov/contact", website:"https://jayapal.house.gov", social:{"twitter":"@RepJayapal","facebook":"repjayahpal"}, influence:82 },
  { name:"Adam Schiff", title:"Representative", chamber:"House", state:"CA", district:"CA-30", party:"Democrat", committees:["House Judiciary Committee","Appropriations Committee"], issues:["intelligence","national_security","civil_rights","rule_of_law"], phone:"202-225-4176", email:"https://schiff.house.gov/contact", website:"https://schiff.house.gov", social:{"twitter":"@RepAdamSchiff","facebook":"adamschiff"}, influence:85 },
  { name:"Rosa DeLauro", title:"Representative", chamber:"House", state:"CT", district:"CT-3", party:"Democrat", committees:["House Appropriations Committee","Labor/HHS/Education Subcommittee"], issues:["healthcare","education","labor","poverty"], phone:"202-225-3661", email:"https://delauro.house.gov/contact", website:"https://delauro.house.gov", social:{"twitter":"@RosaDeLauro","facebook":"RepRosaDeLauro"}, influence:78 },
  { name:"Katie Porter", title:"Representative", chamber:"House", state:"CA", district:"CA-47", party:"Democrat", committees:["House Oversight Committee","Natural Resources Committee"], issues:["consumer_protection","corporate_accountability","housing","environment"], phone:"202-225-5611", email:"https://porter.house.gov/contact", website:"https://porter.house.gov", social:{"twitter":"@RepKatiePorter","facebook":"RepKatiePorter"}, influence:80 },
  { name:"Alexandria Ocasio-Cortez", title:"Representative", chamber:"House", state:"NY", district:"NY-14", party:"Democrat", committees:["House Oversight Committee","Natural Resources Committee"], issues:["housing","healthcare","climate_justice","workers_rights"], phone:"202-225-3965", email:"https://ocasio-cortez.house.gov/contact", website:"https://ocasio-cortez.house.gov", social:{"twitter":"@RepAOC","facebook":"repocasiocortez"}, influence:88 },
  { name:"Ilhan Omar", title:"Representative", chamber:"House", state:"MN", district:"MN-5", party:"Democrat", committees:["House Foreign Affairs Committee","Education Committee"], issues:["immigration","education","human_rights"], phone:"202-225-4755", email:"https://omar.house.gov/contact", website:"https://omar.house.gov", social:{"twitter":"@IlhanMN","facebook":"RepIlhanMN"}, influence:75 },
  { name:"Ayanna Pressley", title:"Representative", chamber:"House", state:"MA", district:"MA-7", party:"Democrat", committees:["House Oversight Committee","Education Committee"], issues:["criminal_justice_reform","education","housing","healthcare"], phone:"202-225-5111", email:"https://pressley.house.gov/contact", website:"https://pressley.house.gov", social:{"twitter":"@RepPressley","facebook":"RepAyannaPressley"}, influence:75 },
  { name:"Rashida Tlaib", title:"Representative", chamber:"House", state:"MI", district:"MI-12", party:"Democrat", committees:["House Oversight Committee","Natural Resources Committee"], issues:["housing","environmental_justice","workers_rights","civil_rights"], phone:"202-225-5126", email:"https://tlaib.house.gov/contact", website:"https://tlaib.house.gov", social:{"twitter":"@RepRashida","facebook":"RepRashidaTlaib"}, influence:75 },
  { name:"Cori Bush", title:"Representative", chamber:"House", state:"MO", district:"MO-1", party:"Democrat", committees:["House Judiciary Committee","Oversight Committee"], issues:["criminal_justice_reform","housing","healthcare","racial_justice"], phone:"202-225-2406", email:"https://bush.house.gov/contact", website:"https://bush.house.gov", social:{"twitter":"@RepCori","facebook":"repcori"}, influence:72 },
  { name:"Jamie Raskin", title:"Representative", chamber:"House", state:"MD", district:"MD-8", party:"Democrat", committees:["House Judiciary Committee","Oversight Committee"], issues:["constitutional_law","civil_rights","election_law","voting_rights"], phone:"202-225-5341", email:"https://raskin.house.gov/contact", website:"https://raskin.house.gov", social:{"twitter":"@RepRaskin","facebook":"repraskin"}, influence:82 },
  { name:"Dan Bishop", title:"Representative", chamber:"House", state:"NC", district:"NC-8", party:"Republican", committees:["House Judiciary Committee","Homeland Security Committee"], issues:["judiciary","immigration","constitutional_law"], phone:"202-225-1976", email:"https://bishop.house.gov/contact", website:"https://bishop.house.gov", social:{"twitter":"@RepDanBishop","facebook":"RepDanBishop"}, influence:65 },
  { name:"Thomas Massie", title:"Representative", chamber:"House", state:"KY", district:"KY-4", party:"Republican", committees:["House Judiciary Committee","Transportation Committee"], issues:["judiciary","technology_policy","civil_liberties"], phone:"202-225-3465", email:"https://massie.house.gov/contact", website:"https://massie.house.gov", social:{"twitter":"@RepThomasMassie","facebook":"RepThomasMassie"}, influence:65 },
];

const legRows = federalLegislators.map(l => ({
  id: randomUUID(),
  name: l.name,
  title: l.title,
  chamber: l.chamber,
  state: l.state,
  district: l.district,
  party: l.party,
  jurisdiction_level: "federal",
  committees: JSON.stringify(l.committees),
  issue_alignment: JSON.stringify(l.issues),
  contact_office: l.website,
  contact_phone: l.phone,
  contact_email: l.email,
  website: l.website,
  social_media: JSON.stringify(l.social),
  voting_record_url: null,
  influence_score: l.influence,
  accessibility_score: Math.floor(40 + Math.random() * 40),
  notes: null,
  is_active: 1,
}));

await ins("coalition_legislators", legRows);

// ═══════════════════════════════════════════════════════════════════════════════
// WASHINGTON STATE LEGISLATORS
// ═══════════════════════════════════════════════════════════════════════════════
const waLegislators = [
  { name:"Patty Murray", title:"Senator", chamber:"Senate", state:"WA", district:"WA", party:"Democrat", committees:["Senate Appropriations Committee - Chair","HELP Committee","Veterans' Affairs Committee"], issues:["healthcare","education","veterans","labor","childcare"], phone:"202-224-2621", email:"https://www.murray.senate.gov/contact", website:"https://www.murray.senate.gov", social:{"twitter":"@PattyMurray","facebook":"SenatorPattyMurray"}, influence:90 },
  { name:"Maria Cantwell", title:"Senator", chamber:"Senate", state:"WA", district:"WA", party:"Democrat", committees:["Senate Commerce Committee - Chair","Finance Committee","Energy Committee"], issues:["technology","trade","energy","consumer_protection"], phone:"202-224-3441", email:"https://www.cantwell.senate.gov/contact", website:"https://www.cantwell.senate.gov", social:{"twitter":"@SenCantwell","facebook":"senatorcantwell"}, influence:85 },
  { name:"Suzan DelBene", title:"Representative", chamber:"House", state:"WA", district:"WA-1", party:"Democrat", committees:["House Ways and Means Committee"], issues:["technology","healthcare","agriculture","trade"], phone:"202-225-6311", email:"https://delbene.house.gov/contact", website:"https://delbene.house.gov", social:{"twitter":"@RepDelBene"}, influence:72 },
  { name:"Rick Larsen", title:"Representative", chamber:"House", state:"WA", district:"WA-2", party:"Democrat", committees:["House Transportation Committee - Ranking Member","Armed Services Committee"], issues:["transportation","military","trade","environment"], phone:"202-225-2605", email:"https://larsen.house.gov/contact", website:"https://larsen.house.gov", social:{"twitter":"@RepRickLarsen"}, influence:70 },
  { name:"Marie Gluesenkamp Perez", title:"Representative", chamber:"House", state:"WA", district:"WA-3", party:"Democrat", committees:["House Small Business Committee","Transportation Committee"], issues:["small_business","rural_issues","infrastructure"], phone:"202-225-3536", email:"https://gluesenkampperez.house.gov/contact", website:"https://gluesenkampperez.house.gov", social:{"twitter":"@RepMGP"}, influence:60 },
  { name:"Dan Newhouse", title:"Representative", chamber:"House", state:"WA", district:"WA-4", party:"Republican", committees:["House Appropriations Committee"], issues:["agriculture","water_rights","energy","immigration"], phone:"202-225-5816", email:"https://newhouse.house.gov/contact", website:"https://newhouse.house.gov", social:{"twitter":"@RepNewhouse"}, influence:65 },
  { name:"Cathy McMorris Rodgers", title:"Representative", chamber:"House", state:"WA", district:"WA-5", party:"Republican", committees:["House Energy and Commerce Committee - Chair"], issues:["energy","technology","healthcare","veterans"], phone:"202-225-2006", email:"https://mcmorris.house.gov/contact", website:"https://mcmorris.house.gov", social:{"twitter":"@CathyMcMorris"}, influence:82 },
  { name:"Derek Kilmer", title:"Representative", chamber:"House", state:"WA", district:"WA-6", party:"Democrat", committees:["House Appropriations Committee","Modernization Committee"], issues:["veterans","infrastructure","manufacturing","education"], phone:"202-225-5916", email:"https://kilmer.house.gov/contact", website:"https://kilmer.house.gov", social:{"twitter":"@RepDerekKilmer"}, influence:70 },
  { name:"Kim Schrier", title:"Representative", chamber:"House", state:"WA", district:"WA-8", party:"Democrat", committees:["House Agriculture Committee","Energy and Commerce Committee"], issues:["healthcare","agriculture","education","environment"], phone:"202-225-7761", email:"https://schrier.house.gov/contact", website:"https://schrier.house.gov", social:{"twitter":"@RepKimSchrier"}, influence:68 },
  { name:"Adam Smith", title:"Representative", chamber:"House", state:"WA", district:"WA-9", party:"Democrat", committees:["House Armed Services Committee - Ranking Member"], issues:["military","veterans","civil_rights","technology"], phone:"202-225-8901", email:"https://adamsmith.house.gov/contact", website:"https://adamsmith.house.gov", social:{"twitter":"@RepAdamSmith"}, influence:80 },
  { name:"Marilyn Strickland", title:"Representative", chamber:"House", state:"WA", district:"WA-10", party:"Democrat", committees:["House Armed Services Committee","Transportation Committee"], issues:["military","transportation","housing","civil_rights"], phone:"202-225-9740", email:"https://strickland.house.gov/contact", website:"https://strickland.house.gov", social:{"twitter":"@RepStricklandWA"}, influence:65 },
  { name:"Bob Ferguson", title:"Attorney General", chamber:"Executive", state:"WA", district:"WA-Statewide", party:"Democrat", committees:["Washington AG Office"], issues:["consumer_protection","civil_rights","environmental_law","corporate_accountability"], phone:"360-753-6200", email:"https://www.atg.wa.gov/contact-us", website:"https://www.atg.wa.gov", social:{"twitter":"@ABORGUARD"}, influence:88 },
  { name:"Steve Hobbs", title:"Secretary of State", chamber:"Executive", state:"WA", district:"WA-Statewide", party:"Democrat", committees:["WA Secretary of State Office"], issues:["elections","voting_rights","public_records"], phone:"360-902-4151", email:"https://www.sos.wa.gov/contact", website:"https://www.sos.wa.gov", social:{"twitter":"@secaborguard"}, influence:65 },
];

const waRows = waLegislators.map(l => ({
  id: randomUUID(),
  name: l.name,
  title: l.title,
  chamber: l.chamber,
  state: l.state,
  district: l.district,
  party: l.party,
  jurisdiction_level: "state",
  committees: JSON.stringify(l.committees),
  issue_alignment: JSON.stringify(l.issues),
  contact_office: l.website,
  contact_phone: l.phone,
  contact_email: l.email,
  website: l.website,
  social_media: JSON.stringify(l.social),
  voting_record_url: null,
  influence_score: l.influence,
  accessibility_score: Math.floor(40 + Math.random() * 40),
  notes: null,
  is_active: 1,
}));

await ins("coalition_legislators", waRows);

// ═══════════════════════════════════════════════════════════════════════════════
// CALIFORNIA STATE LEGISLATORS
// ═══════════════════════════════════════════════════════════════════════════════
const caLegislators = [
  { name:"Alex Padilla", title:"Senator", chamber:"Senate", state:"CA", district:"CA", party:"Democrat", committees:["Senate Judiciary Committee","Environment and Public Works Committee","Health Committee"], issues:["immigration","civil_rights","environment","healthcare"], phone:"202-224-3553", email:"https://www.padilla.senate.gov/contact", website:"https://www.padilla.senate.gov", social:{"twitter":"@SenAlexPadilla"}, influence:80 },
  { name:"Laphonza Butler", title:"Senator", chamber:"Senate", state:"CA", district:"CA", party:"Democrat", committees:["Senate Commerce Committee","Banking Committee","HELP Committee"], issues:["labor","civil_rights","healthcare","housing"], phone:"202-224-3841", email:"https://www.butler.senate.gov/contact", website:"https://www.butler.senate.gov", social:{"twitter":"@SenLaphonza"}, influence:70 },
  { name:"Rob Bonta", title:"Attorney General", chamber:"Executive", state:"CA", district:"CA-Statewide", party:"Democrat", committees:["California AG Office"], issues:["civil_rights","consumer_protection","environmental_justice","gun_safety"], phone:"916-445-9555", email:"https://oag.ca.gov/contact", website:"https://oag.ca.gov", social:{"twitter":"@AGRobBonta"}, influence:88 },
  { name:"Shirley Weber", title:"Secretary of State", chamber:"Executive", state:"CA", district:"CA-Statewide", party:"Democrat", committees:["CA Secretary of State Office"], issues:["elections","voting_rights","public_records"], phone:"916-653-6814", email:"https://www.sos.ca.gov/contact", website:"https://www.sos.ca.gov", social:{"twitter":"@CASOSVote"}, influence:70 },
  { name:"Mark Berman", title:"Assemblymember", chamber:"Assembly", state:"CA", district:"CA-24", party:"Democrat", committees:["Judiciary Committee","Housing Committee"], issues:["housing","civil_rights","judiciary"], phone:"916-319-2024", email:"https://a24.asmdc.org/contact", website:"https://a24.asmdc.org", social:{}, influence:60 },
  { name:"Buffy Wicks", title:"Assemblymember", chamber:"Assembly", state:"CA", district:"CA-14", party:"Democrat", committees:["Housing Committee - Chair","Health Committee"], issues:["housing","healthcare","childcare","labor"], phone:"916-319-2014", email:"https://a14.asmdc.org/contact", website:"https://a14.asmdc.org", social:{"twitter":"@BuffyWicks"}, influence:72 },
  { name:"Scott Wiener", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-11", party:"Democrat", committees:["Housing Committee","Judiciary Committee","Budget Committee"], issues:["housing","civil_rights","technology","healthcare"], phone:"916-651-4011", email:"https://sd11.senate.ca.gov/contact", website:"https://sd11.senate.ca.gov", social:{"twitter":"@Scott_Wiener"}, influence:78 },
  { name:"Nancy Skinner", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-9", party:"Democrat", committees:["Budget Committee - Chair","Public Safety Committee"], issues:["criminal_justice_reform","education","environment","housing"], phone:"916-651-4009", email:"https://sd09.senate.ca.gov/contact", website:"https://sd09.senate.ca.gov", social:{"twitter":"@NancySkinnerCA"}, influence:75 },
  { name:"Dave Cortese", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-15", party:"Democrat", committees:["Labor Committee - Chair","Education Committee"], issues:["labor","education","workers_rights","housing"], phone:"916-651-4015", email:"https://sd15.senate.ca.gov/contact", website:"https://sd15.senate.ca.gov", social:{"twitter":"@SenDaveCortese"}, influence:68 },
  { name:"Aisha Wahab", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-10", party:"Democrat", committees:["Housing Committee","Judiciary Committee"], issues:["housing","civil_rights","technology","consumer_protection"], phone:"916-651-4010", email:"https://sd10.senate.ca.gov/contact", website:"https://sd10.senate.ca.gov", social:{"twitter":"@AishaWahab"}, influence:62 },
  { name:"Brian Dahle", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-1", party:"Republican", committees:["Agriculture Committee","Natural Resources Committee"], issues:["agriculture","water_rights","rural_issues","tax_policy"], phone:"916-651-4001", email:"https://sd01.senate.ca.gov/contact", website:"https://sd01.senate.ca.gov", social:{}, influence:55 },
  { name:"Shannon Grove", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-12", party:"Republican", committees:["Minority Leader","Judiciary Committee"], issues:["judiciary","tax_policy","agriculture","public_safety"], phone:"916-651-4012", email:"https://sd12.senate.ca.gov/contact", website:"https://sd12.senate.ca.gov", social:{"twitter":"@ShannonGroveCA"}, influence:65 },
  { name:"Lena Gonzalez", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-33", party:"Democrat", committees:["Transportation Committee - Chair","Energy Committee"], issues:["transportation","environment","labor","housing"], phone:"916-651-4033", email:"https://sd33.senate.ca.gov/contact", website:"https://sd33.senate.ca.gov", social:{"twitter":"@SenGonzalez33"}, influence:68 },
  { name:"Caroline Menjivar", title:"Senator", chamber:"State Senate", state:"CA", district:"CA-SD-20", party:"Democrat", committees:["Health Committee","Human Services Committee"], issues:["healthcare","immigration","housing","LGBTQ_rights"], phone:"916-651-4020", email:"https://sd20.senate.ca.gov/contact", website:"https://sd20.senate.ca.gov", social:{"twitter":"@SenMenjivar"}, influence:60 },
];

const caRows = caLegislators.map(l => ({
  id: randomUUID(),
  name: l.name,
  title: l.title,
  chamber: l.chamber,
  state: l.state,
  district: l.district,
  party: l.party,
  jurisdiction_level: "state",
  committees: JSON.stringify(l.committees),
  issue_alignment: JSON.stringify(l.issues),
  contact_office: l.website,
  contact_phone: l.phone,
  contact_email: l.email,
  website: l.website,
  social_media: JSON.stringify(l.social),
  voting_record_url: null,
  influence_score: l.influence,
  accessibility_score: Math.floor(40 + Math.random() * 40),
  notes: null,
  is_active: 1,
}));

await ins("coalition_legislators", caRows);

console.log("✅ Legislators seeded");

// ═══════════════════════════════════════════════════════════════════════════════
// FEDERAL AGENCIES
// ═══════════════════════════════════════════════════════════════════════════════
const federalAgencies = [
  { name:"Equal Employment Opportunity Commission", acronym:"EEOC", type:"independent_agency", domains:["employment","civil_rights","disability"], powers:["investigation","mediation","litigation","subpoena"], complaint:"https://www.eeoc.gov/filing-charge-discrimination", phone:"1-800-669-4000", email:"info@eeoc.gov", website:"https://www.eeoc.gov", filing:["online","mail","in_person"], response:180, effectiveness:72 },
  { name:"Department of Housing and Urban Development", acronym:"HUD", type:"cabinet_department", domains:["housing","fair_housing","homelessness"], powers:["investigation","enforcement","rulemaking","funding"], complaint:"https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint", phone:"1-800-669-9777", email:"complaints@hud.gov", website:"https://www.hud.gov", filing:["online","mail","phone"], response:100, effectiveness:65 },
  { name:"Department of Justice - Civil Rights Division", acronym:"DOJ-CRD", type:"cabinet_division", domains:["civil_rights","voting_rights","disability","housing","employment"], powers:["investigation","prosecution","pattern_or_practice_suits","consent_decrees"], complaint:"https://civilrights.justice.gov/report/", phone:"202-514-4609", email:"civil.rights@usdoj.gov", website:"https://www.justice.gov/crt", filing:["online","mail"], response:90, effectiveness:80 },
  { name:"Consumer Financial Protection Bureau", acronym:"CFPB", type:"independent_agency", domains:["consumer_protection","financial_services","lending","debt_collection"], powers:["investigation","rulemaking","enforcement","supervision"], complaint:"https://www.consumerfinance.gov/complaint/", phone:"1-855-411-2372", email:"info@consumerfinance.gov", website:"https://www.consumerfinance.gov", filing:["online","phone","mail"], response:60, effectiveness:75 },
  { name:"Federal Trade Commission", acronym:"FTC", type:"independent_agency", domains:["consumer_protection","antitrust","privacy","advertising"], powers:["investigation","rulemaking","enforcement","litigation"], complaint:"https://reportfraud.ftc.gov/", phone:"1-877-382-4357", email:"info@ftc.gov", website:"https://www.ftc.gov", filing:["online","phone"], response:90, effectiveness:70 },
  { name:"Social Security Administration", acronym:"SSA", type:"independent_agency", domains:["benefits","disability","retirement","survivors"], powers:["adjudication","benefits_administration","appeals"], complaint:"https://www.ssa.gov/agency/contact/", phone:"1-800-772-1213", email:null, website:"https://www.ssa.gov", filing:["online","phone","in_person"], response:120, effectiveness:60 },
  { name:"Department of Labor", acronym:"DOL", type:"cabinet_department", domains:["employment","labor","wages","workplace_safety","benefits"], powers:["investigation","enforcement","rulemaking","mediation"], complaint:"https://www.dol.gov/agencies/whd/contact/complaints", phone:"1-866-487-2365", email:"info@dol.gov", website:"https://www.dol.gov", filing:["online","phone","mail"], response:90, effectiveness:68 },
  { name:"National Labor Relations Board", acronym:"NLRB", type:"independent_agency", domains:["labor","union_rights","collective_bargaining"], powers:["investigation","adjudication","enforcement","elections"], complaint:"https://www.nlrb.gov/about-nlrb/what-we-do/investigate-charges", phone:"1-866-667-6572", email:"info@nlrb.gov", website:"https://www.nlrb.gov", filing:["online","mail","in_person"], response:120, effectiveness:65 },
  { name:"Environmental Protection Agency", acronym:"EPA", type:"independent_agency", domains:["environment","environmental_justice","pollution","water_quality"], powers:["investigation","enforcement","rulemaking","permitting"], complaint:"https://echo.epa.gov/report-environmental-violations", phone:"202-564-4700", email:"info@epa.gov", website:"https://www.epa.gov", filing:["online","phone","mail"], response:90, effectiveness:65 },
  { name:"Department of Education - Office for Civil Rights", acronym:"ED-OCR", type:"cabinet_division", domains:["education","civil_rights","disability","title_ix"], powers:["investigation","compliance_review","enforcement","technical_assistance"], complaint:"https://ocrcas.ed.gov/", phone:"1-800-421-3481", email:"ocr@ed.gov", website:"https://www2.ed.gov/about/offices/list/ocr/index.html", filing:["online","mail"], response:180, effectiveness:62 },
  { name:"Department of Veterans Affairs", acronym:"VA", type:"cabinet_department", domains:["veterans","healthcare","disability","benefits"], powers:["benefits_administration","healthcare","adjudication","appeals"], complaint:"https://www.va.gov/contact-us/", phone:"1-800-827-1000", email:null, website:"https://www.va.gov", filing:["online","phone","in_person"], response:120, effectiveness:55 },
  { name:"Federal Communications Commission", acronym:"FCC", type:"independent_agency", domains:["telecommunications","broadband","media","consumer_protection"], powers:["rulemaking","enforcement","licensing","adjudication"], complaint:"https://consumercomplaints.fcc.gov/", phone:"1-888-225-5322", email:"fccinfo@fcc.gov", website:"https://www.fcc.gov", filing:["online","phone","mail"], response:60, effectiveness:60 },
  { name:"Securities and Exchange Commission", acronym:"SEC", type:"independent_agency", domains:["securities","financial_fraud","investor_protection"], powers:["investigation","enforcement","rulemaking","adjudication"], complaint:"https://www.sec.gov/tcr", phone:"1-800-732-0330", email:"help@sec.gov", website:"https://www.sec.gov", filing:["online","mail"], response:90, effectiveness:72 },
  { name:"Department of Health and Human Services", acronym:"HHS", type:"cabinet_department", domains:["healthcare","benefits","disability","civil_rights"], powers:["rulemaking","enforcement","funding","investigation"], complaint:"https://www.hhs.gov/ocr/complaints/index.html", phone:"1-800-368-1019", email:"ocrmail@hhs.gov", website:"https://www.hhs.gov", filing:["online","mail","phone"], response:120, effectiveness:62 },
  { name:"Occupational Safety and Health Administration", acronym:"OSHA", type:"cabinet_division", parent:"Department of Labor", domains:["workplace_safety","worker_protection","whistleblower"], powers:["investigation","enforcement","rulemaking","citations"], complaint:"https://www.osha.gov/workers/file-complaint", phone:"1-800-321-6742", email:null, website:"https://www.osha.gov", filing:["online","phone","mail"], response:30, effectiveness:70 },
  { name:"U.S. Commission on Civil Rights", acronym:"USCCR", type:"independent_commission", domains:["civil_rights","voting_rights","discrimination"], powers:["investigation","reporting","advisory","hearings"], complaint:"https://www.usccr.gov/contact", phone:"202-376-7700", email:"publicaffairs@usccr.gov", website:"https://www.usccr.gov", filing:["online","mail"], response:180, effectiveness:45 },
  { name:"Office of Federal Contract Compliance Programs", acronym:"OFCCP", type:"cabinet_division", parent:"Department of Labor", domains:["employment","affirmative_action","federal_contractors"], powers:["investigation","compliance_review","enforcement","debarment"], complaint:"https://www.dol.gov/agencies/ofccp/contact/file-complaint", phone:"1-800-397-6251", email:null, website:"https://www.dol.gov/agencies/ofccp", filing:["online","mail"], response:120, effectiveness:58 },
  { name:"Wage and Hour Division", acronym:"WHD", type:"cabinet_division", parent:"Department of Labor", domains:["wages","overtime","child_labor","family_leave"], powers:["investigation","enforcement","back_pay_recovery","litigation"], complaint:"https://www.dol.gov/agencies/whd/contact/complaints", phone:"1-866-487-2365", email:null, website:"https://www.dol.gov/agencies/whd", filing:["online","phone","mail"], response:60, effectiveness:72 },
];

const agencyRows = federalAgencies.map(a => ({
  id: randomUUID(),
  name: a.name,
  acronym: a.acronym,
  agency_type: a.type,
  jurisdiction_level: "federal",
  state: null,
  parent_agency: a.parent || null,
  domains: JSON.stringify(a.domains),
  enforcement_powers: JSON.stringify(a.powers),
  complaint_url: a.complaint,
  contact_phone: a.phone,
  contact_email: a.email,
  website: a.website,
  address: null,
  filing_methods: JSON.stringify(a.filing),
  response_time_days: a.response,
  effectiveness_score: a.effectiveness,
  notes: null,
  is_active: 1,
}));

await ins("coalition_agencies", agencyRows);
console.log("✅ Federal agencies seeded");

// ═══════════════════════════════════════════════════════════════════════════════
// STATE AGENCIES
// ═══════════════════════════════════════════════════════════════════════════════
const stateAgencies = [
  { name:"Washington State Human Rights Commission", acronym:"WSHRC", type:"state_commission", state:"WA", domains:["civil_rights","employment","housing","public_accommodations"], powers:["investigation","mediation","adjudication","enforcement"], complaint:"https://www.hum.wa.gov/file-complaint", phone:"360-753-6770", email:"humanrights@hum.wa.gov", website:"https://www.hum.wa.gov", response:180, effectiveness:68 },
  { name:"Washington State Attorney General - Civil Rights Division", acronym:"WA-AG-CRD", type:"state_division", state:"WA", domains:["civil_rights","consumer_protection","environmental_law"], powers:["investigation","litigation","enforcement","rulemaking"], complaint:"https://www.atg.wa.gov/file-complaint", phone:"360-753-6200", email:"civilrights@atg.wa.gov", website:"https://www.atg.wa.gov", response:90, effectiveness:75 },
  { name:"Washington Department of Labor & Industries", acronym:"WA-LNI", type:"state_department", state:"WA", domains:["workplace_safety","workers_compensation","wages","labor"], powers:["investigation","enforcement","adjudication","citations"], complaint:"https://lni.wa.gov/workers-rights/workplace-complaints/", phone:"360-902-5800", email:null, website:"https://lni.wa.gov", response:60, effectiveness:70 },
  { name:"California Department of Fair Employment and Housing", acronym:"CA-DFEH", type:"state_department", state:"CA", domains:["civil_rights","employment","housing","disability"], powers:["investigation","mediation","litigation","enforcement"], complaint:"https://calcivilrights.ca.gov/complaintprocess/", phone:"800-884-1684", email:null, website:"https://calcivilrights.ca.gov", response:120, effectiveness:72 },
  { name:"California Attorney General - Civil Rights Enforcement", acronym:"CA-AG-CRE", type:"state_division", state:"CA", domains:["civil_rights","consumer_protection","environmental_justice","privacy"], powers:["investigation","litigation","enforcement","rulemaking"], complaint:"https://oag.ca.gov/contact/consumer-complaint-against-business-or-company", phone:"916-445-9555", email:null, website:"https://oag.ca.gov", response:90, effectiveness:78 },
  { name:"California Division of Labor Standards Enforcement", acronym:"CA-DLSE", type:"state_division", state:"CA", domains:["wages","labor","workplace_safety","retaliation"], powers:["investigation","enforcement","citations","back_pay_recovery"], complaint:"https://www.dir.ca.gov/dlse/howtofilewageclaim.htm", phone:"844-522-6734", email:null, website:"https://www.dir.ca.gov/dlse/", response:60, effectiveness:70 },
  { name:"New York State Division of Human Rights", acronym:"NY-DHR", type:"state_division", state:"NY", domains:["civil_rights","employment","housing","public_accommodations"], powers:["investigation","mediation","adjudication","enforcement"], complaint:"https://dhr.ny.gov/complaint", phone:"888-392-3644", email:"info@dhr.ny.gov", website:"https://dhr.ny.gov", response:180, effectiveness:65 },
  { name:"New York Attorney General - Civil Rights Bureau", acronym:"NY-AG-CRB", type:"state_division", state:"NY", domains:["civil_rights","consumer_protection","housing","labor"], powers:["investigation","litigation","enforcement","rulemaking"], complaint:"https://ag.ny.gov/file-complaint", phone:"800-771-7755", email:null, website:"https://ag.ny.gov", response:90, effectiveness:78 },
  { name:"Texas Workforce Commission - Civil Rights Division", acronym:"TX-TWC-CRD", type:"state_division", state:"TX", domains:["employment","civil_rights","disability"], powers:["investigation","mediation","enforcement"], complaint:"https://www.twc.texas.gov/jobseekers/how-submit-employment-discrimination-complaint", phone:"512-463-2642", email:null, website:"https://www.twc.texas.gov", response:180, effectiveness:55 },
  { name:"Florida Commission on Human Relations", acronym:"FL-FCHR", type:"state_commission", state:"FL", domains:["civil_rights","employment","housing","public_accommodations"], powers:["investigation","mediation","enforcement"], complaint:"https://fchr.myflorida.com/complaint-process", phone:"850-488-7082", email:"fchrinfo@fchr.myflorida.com", website:"https://fchr.myflorida.com", response:180, effectiveness:50 },
  { name:"Illinois Department of Human Rights", acronym:"IL-DHR", type:"state_department", state:"IL", domains:["civil_rights","employment","housing","disability"], powers:["investigation","mediation","enforcement","adjudication"], complaint:"https://www2.illinois.gov/dhr/FilingaCharge/Pages/default.aspx", phone:"312-814-6200", email:null, website:"https://www2.illinois.gov/dhr", response:180, effectiveness:62 },
  { name:"Michigan Department of Civil Rights", acronym:"MI-DCR", type:"state_department", state:"MI", domains:["civil_rights","employment","housing","education"], powers:["investigation","mediation","enforcement","adjudication"], complaint:"https://www.michigan.gov/mdcr/file-a-complaint", phone:"800-482-3604", email:null, website:"https://www.michigan.gov/mdcr", response:180, effectiveness:60 },
  { name:"Minnesota Department of Human Rights", acronym:"MN-DHR", type:"state_department", state:"MN", domains:["civil_rights","employment","housing","public_accommodations","education"], powers:["investigation","mediation","enforcement","litigation"], complaint:"https://mn.gov/mdhr/intake/file/", phone:"651-539-1100", email:"info.mdhr@state.mn.us", website:"https://mn.gov/mdhr", response:120, effectiveness:70 },
];

const stateAgencyRows = stateAgencies.map(a => ({
  id: randomUUID(),
  name: a.name,
  acronym: a.acronym,
  agency_type: a.type,
  jurisdiction_level: "state",
  state: a.state,
  parent_agency: null,
  domains: JSON.stringify(a.domains),
  enforcement_powers: JSON.stringify(a.powers),
  complaint_url: a.complaint,
  contact_phone: a.phone,
  contact_email: a.email,
  website: a.website,
  address: null,
  filing_methods: JSON.stringify(["online","mail"]),
  response_time_days: a.response,
  effectiveness_score: a.effectiveness,
  notes: null,
  is_active: 1,
}));

await ins("coalition_agencies", stateAgencyRows);
console.log("✅ State agencies seeded");

// ═══════════════════════════════════════════════════════════════════════════════
// ADVOCACY ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════
const advocacyOrgs = [
  { name:"American Civil Liberties Union (ACLU)", type:"national_legal_org", jurisdiction:"National", state:null, domains:["civil_rights","criminal_justice","immigration","disability","voting_rights"], services:["litigation","policy_advocacy","public_education","direct_representation"], email:"info@aclu.org", phone:"212-549-2500", website:"https://www.aclu.org", willingness:"high", influence:95 },
  { name:"ACLU of Washington", type:"state_affiliate", jurisdiction:"Washington", state:"WA", domains:["civil_rights","criminal_justice","immigration","privacy"], services:["litigation","policy_advocacy","public_education","direct_representation"], email:"info@aclu-wa.org", phone:"206-624-2184", website:"https://www.aclu-wa.org", willingness:"high", influence:85 },
  { name:"ACLU of Southern California", type:"state_affiliate", jurisdiction:"California", state:"CA", domains:["civil_rights","immigration","criminal_justice","technology"], services:["litigation","policy_advocacy","public_education"], email:"info@aclusocal.org", phone:"213-977-9500", website:"https://www.aclusocal.org", willingness:"high", influence:85 },
  { name:"National Association for the Advancement of Colored People (NAACP)", type:"national_advocacy", jurisdiction:"National", state:null, domains:["civil_rights","voting_rights","criminal_justice","education","housing"], services:["policy_advocacy","litigation","community_organizing","public_education"], email:"info@naacp.org", phone:"877-622-2798", website:"https://naacp.org", willingness:"high", influence:90 },
  { name:"Disability Rights Washington", type:"state_legal_org", jurisdiction:"Washington", state:"WA", domains:["disability","civil_rights","education","employment","housing"], services:["direct_representation","policy_advocacy","investigation","self_advocacy_training"], email:"info@dr-wa.org", phone:"800-562-2702", website:"https://www.disabilityrightswa.org", willingness:"high", influence:78 },
  { name:"Disability Rights California", type:"state_legal_org", jurisdiction:"California", state:"CA", domains:["disability","civil_rights","education","employment","healthcare"], services:["direct_representation","policy_advocacy","investigation","self_advocacy_training"], email:"info@disabilityrightsca.org", phone:"800-776-5746", website:"https://www.disabilityrightsca.org", willingness:"high", influence:80 },
  { name:"Northwest Justice Project", type:"state_legal_aid", jurisdiction:"Washington", state:"WA", domains:["housing","employment","benefits","consumer","family_law"], services:["direct_representation","legal_advice","self_help_resources"], email:"info@nwjustice.org", phone:"888-201-1014", website:"https://nwjustice.org", willingness:"high", influence:75 },
  { name:"Legal Aid Society of New York", type:"state_legal_aid", jurisdiction:"New York", state:"NY", domains:["housing","employment","benefits","immigration","criminal_defense"], services:["direct_representation","policy_advocacy","community_education"], email:"info@legal-aid.org", phone:"212-577-3300", website:"https://www.legalaidnyc.org", willingness:"high", influence:85 },
  { name:"National Employment Law Project (NELP)", type:"national_policy_org", jurisdiction:"National", state:null, domains:["employment","labor","wages","workers_rights"], services:["policy_advocacy","research","litigation_support","technical_assistance"], email:"info@nelp.org", phone:"212-285-3025", website:"https://www.nelp.org", willingness:"high", influence:80 },
  { name:"National Housing Law Project", type:"national_policy_org", jurisdiction:"National", state:null, domains:["housing","fair_housing","homelessness","tenant_rights"], services:["policy_advocacy","litigation_support","technical_assistance","training"], email:"info@nhlp.org", phone:"415-546-7000", website:"https://www.nhlp.org", willingness:"high", influence:75 },
  { name:"Southern Poverty Law Center (SPLC)", type:"national_legal_org", jurisdiction:"National", state:null, domains:["civil_rights","hate_groups","criminal_justice","immigration","children_rights"], services:["litigation","investigation","policy_advocacy","public_education"], email:"info@splcenter.org", phone:"334-956-8200", website:"https://www.splcenter.org", willingness:"high", influence:88 },
  { name:"Lambda Legal", type:"national_legal_org", jurisdiction:"National", state:null, domains:["LGBTQ_rights","civil_rights","HIV_discrimination","employment","housing"], services:["litigation","policy_advocacy","public_education","help_desk"], email:"info@lambdalegal.org", phone:"212-809-8585", website:"https://www.lambdalegal.org", willingness:"high", influence:80 },
  { name:"National Immigration Law Center (NILC)", type:"national_legal_org", jurisdiction:"National", state:null, domains:["immigration","civil_rights","employment","benefits","healthcare"], services:["litigation","policy_advocacy","technical_assistance","public_education"], email:"info@nilc.org", phone:"213-639-3900", website:"https://www.nilc.org", willingness:"high", influence:78 },
  { name:"Center for Constitutional Rights (CCR)", type:"national_legal_org", jurisdiction:"National", state:null, domains:["civil_rights","human_rights","government_accountability","racial_justice"], services:["litigation","policy_advocacy","public_education","movement_support"], email:"info@ccrjustice.org", phone:"212-614-6464", website:"https://ccrjustice.org", willingness:"high", influence:82 },
  { name:"Earthjustice", type:"national_legal_org", jurisdiction:"National", state:null, domains:["environmental_justice","climate","pollution","public_lands","wildlife"], services:["litigation","policy_advocacy","legislative_advocacy"], email:"info@earthjustice.org", phone:"800-584-6460", website:"https://earthjustice.org", willingness:"medium", influence:82 },
  { name:"National Consumer Law Center (NCLC)", type:"national_policy_org", jurisdiction:"National", state:null, domains:["consumer_protection","debt","lending","utilities","financial_services"], services:["policy_advocacy","litigation_support","technical_assistance","training"], email:"info@nclc.org", phone:"617-542-8010", website:"https://www.nclc.org", willingness:"high", influence:78 },
  { name:"National Women's Law Center", type:"national_policy_org", jurisdiction:"National", state:null, domains:["gender_equality","employment","education","healthcare","reproductive_rights"], services:["policy_advocacy","litigation","public_education","research"], email:"info@nwlc.org", phone:"202-588-5180", website:"https://nwlc.org", willingness:"high", influence:82 },
  { name:"Brennan Center for Justice", type:"national_policy_org", jurisdiction:"National", state:null, domains:["voting_rights","democracy","criminal_justice","courts"], services:["research","policy_advocacy","litigation","public_education"], email:"info@brennancenter.org", phone:"646-292-8310", website:"https://www.brennancenter.org", willingness:"medium", influence:85 },
  { name:"Public Citizen", type:"national_advocacy", jurisdiction:"National", state:null, domains:["consumer_protection","corporate_accountability","government_transparency","healthcare"], services:["policy_advocacy","litigation","research","public_education"], email:"info@citizen.org", phone:"202-588-1000", website:"https://www.citizen.org", willingness:"high", influence:75 },
  { name:"National Legal Aid & Defender Association (NLADA)", type:"national_umbrella", jurisdiction:"National", state:null, domains:["legal_aid","criminal_defense","civil_legal_services"], services:["technical_assistance","training","policy_advocacy","research"], email:"info@nlada.org", phone:"202-452-0620", website:"https://www.nlada.org", willingness:"high", influence:72 },
  { name:"Columbia Legal Services", type:"state_legal_aid", jurisdiction:"Washington", state:"WA", domains:["housing","employment","immigration","civil_rights","farmworker_rights"], services:["direct_representation","policy_advocacy","community_education"], email:"info@columbialegal.org", phone:"206-464-5911", website:"https://www.columbialegal.org", willingness:"high", influence:72 },
  { name:"TeamChild", type:"state_legal_org", jurisdiction:"Washington", state:"WA", domains:["juvenile_justice","education","housing","benefits","children_rights"], services:["direct_representation","policy_advocacy","training"], email:"info@teamchild.org", phone:"206-322-2444", website:"https://www.teamchild.org", willingness:"high", influence:65 },
  { name:"OneAmerica", type:"state_advocacy", jurisdiction:"Washington", state:"WA", domains:["immigration","civil_rights","voting_rights","education"], services:["community_organizing","policy_advocacy","civic_engagement","leadership_development"], email:"info@weareoneamerica.org", phone:"206-723-2203", website:"https://weareoneamerica.org", willingness:"high", influence:70 },
  { name:"El Centro de la Raza", type:"community_org", jurisdiction:"Washington", state:"WA", domains:["immigration","housing","education","healthcare","employment"], services:["direct_services","community_organizing","policy_advocacy","education"], email:"info@elcentrodelaraza.org", phone:"206-329-7960", website:"https://www.elcentrodelaraza.org", willingness:"high", influence:68 },
  { name:"Asian Counseling and Referral Service (ACRS)", type:"community_org", jurisdiction:"Washington", state:"WA", domains:["immigration","healthcare","housing","employment","education"], services:["direct_services","counseling","case_management","advocacy"], email:"info@acrs.org", phone:"206-695-7600", website:"https://acrs.org", willingness:"medium", influence:65 },
  { name:"Tenants Union of Washington State", type:"state_advocacy", jurisdiction:"Washington", state:"WA", domains:["housing","tenant_rights","fair_housing"], services:["tenant_counseling","policy_advocacy","community_organizing","education"], email:"info@tenantsunion.org", phone:"206-723-0500", website:"https://tenantsunion.org", willingness:"high", influence:72 },
  { name:"Fair Housing Center of Washington", type:"state_legal_org", jurisdiction:"Washington", state:"WA", domains:["fair_housing","civil_rights","disability","housing"], services:["investigation","testing","litigation","education"], email:"info@fhcwashington.org", phone:"253-274-9523", website:"https://fhcwashington.org", willingness:"high", influence:70 },
  { name:"California Rural Legal Assistance (CRLA)", type:"state_legal_aid", jurisdiction:"California", state:"CA", domains:["farmworker_rights","housing","employment","immigration","education"], services:["direct_representation","policy_advocacy","community_education"], email:"info@crla.org", phone:"209-577-3811", website:"https://www.crla.org", willingness:"high", influence:75 },
  { name:"Western Center on Law & Poverty", type:"state_policy_org", jurisdiction:"California", state:"CA", domains:["housing","benefits","healthcare","consumer_protection"], services:["policy_advocacy","litigation","technical_assistance"], email:"info@wclp.org", phone:"213-487-7211", website:"https://wclp.org", willingness:"high", influence:72 },
  { name:"National Center for Law and Economic Justice", type:"national_policy_org", jurisdiction:"National", state:null, domains:["benefits","poverty","employment","consumer_protection"], services:["litigation","policy_advocacy","technical_assistance"], email:"info@nclej.org", phone:"212-633-6967", website:"https://nclej.org", willingness:"high", influence:70 },
];

const orgRows = advocacyOrgs.map(o => ({
  id: randomUUID(),
  name: o.name,
  org_type: o.type,
  jurisdiction: o.jurisdiction,
  state: o.state,
  domains: JSON.stringify(o.domains),
  services_offered: JSON.stringify(o.services),
  contact_email: o.email,
  contact_phone: o.phone,
  website: o.website,
  address: null,
  description: null,
  eligibility_criteria: null,
  languages: JSON.stringify(["English"]),
  intake_url: o.website,
  coalition_willingness: o.willingness,
  influence_score: o.influence,
  is_verified: 1,
  notes: null,
}));

await ins("coalition_advocacy_orgs", orgRows);
console.log("✅ Advocacy orgs seeded");

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA CONTACTS
// ═══════════════════════════════════════════════════════════════════════════════
const mediaContacts = [
  { name:"Emily Bazelon", outlet:"The New York Times Magazine", type:"print", beat:["courts","criminal_justice","civil_rights"], jurisdiction:"National", state:null, social:{"twitter":"@emilybazelon"}, reach:95, responsiveness:60 },
  { name:"Adam Liptak", outlet:"The New York Times", type:"print", beat:["supreme_court","constitutional_law"], jurisdiction:"National", state:null, social:{"twitter":"@adamliptak"}, reach:95, responsiveness:50 },
  { name:"Nina Totenberg", outlet:"NPR", type:"broadcast", beat:["supreme_court","legal_affairs"], jurisdiction:"National", state:null, social:{"twitter":"@NinaTotenberg"}, reach:90, responsiveness:45 },
  { name:"Radley Balko", outlet:"The Watch (Substack)", type:"independent", beat:["criminal_justice","police_accountability","civil_liberties"], jurisdiction:"National", state:null, social:{"twitter":"@radaborguard"}, reach:80, responsiveness:70 },
  { name:"Dahlia Lithwick", outlet:"Slate", type:"online", beat:["courts","legal_affairs","civil_rights"], jurisdiction:"National", state:null, social:{"twitter":"@Dahlialithwick"}, reach:82, responsiveness:65 },
  { name:"Mark Joseph Stern", outlet:"Slate", type:"online", beat:["courts","LGBTQ_rights","civil_rights","voting_rights"], jurisdiction:"National", state:null, social:{"twitter":"@maborguard"}, reach:80, responsiveness:70 },
  { name:"Ian Millhiser", outlet:"Vox", type:"online", beat:["supreme_court","constitutional_law","courts"], jurisdiction:"National", state:null, social:{"twitter":"@imillhiser"}, reach:82, responsiveness:65 },
  { name:"Elie Mystal", outlet:"The Nation", type:"print", beat:["courts","racial_justice","criminal_justice"], jurisdiction:"National", state:null, social:{"twitter":"@ElieNYC"}, reach:78, responsiveness:70 },
  { name:"Jessica Huseman", outlet:"Votebeat", type:"online", beat:["voting_rights","elections","democracy"], jurisdiction:"National", state:null, social:{"twitter":"@JessicaHuseman"}, reach:72, responsiveness:75 },
  { name:"Melissa Santos", outlet:"Axios Seattle", type:"online", beat:["politics","policy","housing"], jurisdiction:"Washington", state:"WA", social:{"twitter":"@melissasantos1"}, reach:70, responsiveness:75 },
  { name:"Jim Brunner", outlet:"The Seattle Times", type:"print", beat:["politics","government","policy"], jurisdiction:"Washington", state:"WA", social:{"twitter":"@jaborguard"}, reach:72, responsiveness:70 },
  { name:"Sydney Brownstone", outlet:"The Seattle Times", type:"print", beat:["housing","homelessness","social_services"], jurisdiction:"Washington", state:"WA", social:{"twitter":"@sydbrownstone"}, reach:70, responsiveness:72 },
  { name:"Lilly Fowler", outlet:"Crosscut", type:"online", beat:["civil_rights","immigration","social_justice"], jurisdiction:"Washington", state:"WA", social:{"twitter":"@lillyfowler"}, reach:65, responsiveness:78 },
  { name:"Ansel Herz", outlet:"PubliCola", type:"online", beat:["housing","police","city_politics"], jurisdiction:"Washington", state:"WA", social:{"twitter":"@Aborguard"}, reach:62, responsiveness:80 },
  { name:"Jason Song", outlet:"Los Angeles Times", type:"print", beat:["courts","criminal_justice","legal_affairs"], jurisdiction:"California", state:"CA", social:{"twitter":"@lataborguard"}, reach:85, responsiveness:60 },
  { name:"Maura Dolan", outlet:"Los Angeles Times", type:"print", beat:["courts","supreme_court","legal_affairs"], jurisdiction:"California", state:"CA", social:{"twitter":"@mauradolan"}, reach:82, responsiveness:55 },
  { name:"Bob Egelko", outlet:"San Francisco Chronicle", type:"print", beat:["courts","civil_rights","legal_affairs"], jurisdiction:"California", state:"CA", social:{"twitter":"@BobEgelko"}, reach:78, responsiveness:65 },
  { name:"Alexei Koseff", outlet:"San Francisco Chronicle", type:"print", beat:["state_politics","policy","legislation"], jurisdiction:"California", state:"CA", social:{"twitter":"@akoseff"}, reach:75, responsiveness:68 },
  { name:"Julianne Hing", outlet:"The Nation", type:"print", beat:["immigration","racial_justice","civil_rights"], jurisdiction:"National", state:null, social:{"twitter":"@juliannehing"}, reach:72, responsiveness:70 },
  { name:"Liliana Segura", outlet:"The Intercept", type:"online", beat:["criminal_justice","death_penalty","prisons"], jurisdiction:"National", state:null, social:{"twitter":"@lilaborguard"}, reach:75, responsiveness:65 },
];

const mediaRows = mediaContacts.map(m => ({
  id: randomUUID(),
  name: m.name,
  outlet: m.outlet,
  media_type: m.type,
  beat: JSON.stringify(m.beat),
  jurisdiction: m.jurisdiction,
  state: m.state,
  contact_email: null,
  contact_phone: null,
  social_media: JSON.stringify(m.social),
  website: null,
  reach_score: m.reach,
  responsiveness_score: m.responsiveness,
  previous_coverage: JSON.stringify([]),
  notes: null,
  is_active: 1,
}));

await ins("coalition_media", mediaRows);
console.log("✅ Media contacts seeded");

// Verify counts
const tables = ["coalition_legislators","coalition_agencies","coalition_advocacy_orgs","coalition_media"];
for (const t of tables) {
  const [rows] = await conn.query(`SELECT COUNT(*) as c FROM ${t}`);
  console.log(`${t}: ${rows[0].c} records`);
}

await conn.end();
console.log("✅ Session 60 seed complete");
