/* ===========================================================================
   data/lore.js — bosses, vices, story beats, shlokas, codex
   A devotional tribute. Sanskrit verses are traditional and public domain.
   =========================================================================== */

export const SHLOKAS = {
  vakra: {
    deva: 'वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ ।\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा ॥',
    tr: 'O Lord of the curved trunk and colossal form, radiant as ten million suns — O God, remove every obstacle from all my undertakings, always.',
  },
  gajananam: {
    deva: 'गजाननं भूतगणादिसेवितं कपित्थजम्बूफलचारुभक्षणम् ।\nउमासुतं शोकविनाशकारणं नमामि विघ्नेश्वरपादपङ्कजम् ॥',
    tr: 'Elephant-faced, served by the hosts of beings, delighting in wood-apple and rose-apple fruit, son of Uma, cause of the destruction of sorrow — I bow to the lotus feet of the Lord of Obstacles.',
  },
  gayatri: {
    deva: 'तत्पुरुषाय विद्महे वक्रतुण्डाय धीमहि ।\nतन्नो दन्तिः प्रचोदयात् ॥',
    tr: 'May we know the Supreme Being, may we meditate upon the Curved-Tusked One; may the Elephant Lord impel us onward.',
  },
  trividham: {
    deva: 'त्रिविधं नरकस्येदं द्वारं नाशनमात्मनः ।\nकामः क्रोधस्तथा लोभस्तस्मादेतत्त्रयं त्यजेत् ॥',
    tr: 'Threefold is this gate of ruin, destructive of the self — desire, anger, and greed. Therefore, abandon these three. — Bhagavad Gita 16.21',
  },
  uddharet: {
    deva: 'उद्धरेदात्मनात्मानं नात्मानमवसादयेत् ।\nआत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः ॥',
    tr: 'Raise yourself by your own Self; do not let yourself sink. For the Self alone is the friend of the self, and the Self alone is its enemy. — Bhagavad Gita 6.5',
  },
  klAibya: {
    deva: 'क्लैब्यं मा स्म गमः पार्थ नैतत्त्वय्युपपद्यते ।\nक्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप ॥',
    tr: 'Do not yield to faintness of heart — it does not befit you. Cast off this petty weakness of spirit and arise, O scorcher of foes. — Bhagavad Gita 2.3',
  },
  karmany: {
    deva: 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥',
    tr: 'Your right is to the work alone, never to its fruits. Let not the fruit be your motive, nor let your attachment be to inaction. — Bhagavad Gita 2.47',
  },
  nainam: {
    deva: 'नैनं छिन्दन्ति शस्त्राणि नैनं दहति पावकः ।\nन चैनं क्लेदयन्त्यापो न शोषयति मारुतः ॥',
    tr: 'Weapons cannot cut it, fire cannot burn it, water cannot wet it, wind cannot wither it. — Bhagavad Gita 2.23',
  },
};

export const DEATH_QUOTES = [
  { deva: SHLOKAS.klAibya.deva, tr: SHLOKAS.klAibya.tr },
  { deva: SHLOKAS.uddharet.deva, tr: SHLOKAS.uddharet.tr },
  { deva: SHLOKAS.karmany.deva, tr: SHLOKAS.karmany.tr },
  { deva: 'पुनरपि जननं पुनरपि मरणं पुनरपि जननी जठरे शयनम् ।', tr: 'Again birth, again death, again lying in the mother\u2019s womb — O seeker, rise and cross this ocean of becoming. (Bhaja Govindam 21)' },
  { deva: 'श्रद्धावान् लभते ज्ञानं तत्परः संयतेन्द्रियः ।', tr: 'The one of faith, devoted and with senses mastered, gains wisdom. — Bhagavad Gita 4.39' },
];

/* ------------------------------- BOSSES ---------------------------------- */
export const BOSSES = [
  {
    day: 1, id: 'matsara', name: 'Matsarasura', deva: 'मत्सरासुर', title: 'Demon of Jealousy',
    vice: 'Matsara · Jealousy', color: '#6bd46b', color2: '#1d4a22', arena: 'The Rotting Heart of the Marsh',
    hp: 460, phases: 3, size: 1.0,
    taunt: 'Why should the little mouse be loved and I, who am greater, be forgotten? I will take everything that shines on you.',
    defeat: 'Your light… was never yours to give… nor mine to take…',
    weakness: 'He steals what you gather. Strike him while he gloats over a stolen modak.',
    myth: 'Matsara is the pain of another\u2019s good fortune. In the Gita it is named among the gates of ruin; here it takes the shape of a marsh-demon that feeds on comparison and cannot bear the devotion shown to another.',
  },
  {
    day: 2, id: 'mada', name: 'Madasura', deva: 'मदासुर', title: 'Demon of Pride',
    vice: 'Mada · Arrogance', color: '#e8c25a', color2: '#4a3410', arena: 'The Throne of the Unscalable Wall',
    hp: 560, phases: 3, size: 1.22,
    taunt: 'Kneel, vermin. I am the crown above all crowns. Nothing so small has ever deserved to look upon me.',
    defeat: 'A mouse… broke… my crown…',
    weakness: 'His armour laughs at claws. Only a full-speed divine Charge can crack it.',
    myth: 'Mada is the intoxication of status — the belief that the self is too large to be wrong. Pride is armour: it protects, and it imprisons. It shatters only when met head-on, without fear.',
  },
  {
    day: 3, id: 'moha', name: 'Mohasura', deva: 'मोहासुर', title: 'Demon of Delusion',
    vice: 'Moha · Illusion', color: '#b98bff', color2: '#2b1a4d', arena: 'The Shifting Labyrinth',
    hp: 900, phases: 3, size: 1.05,
    taunt: 'Which of me is real, little one? None of them. None of YOU either. That is the mercy I offer.',
    defeat: 'You saw… me. That has never… happened before.',
    weakness: 'Nine bodies walk the arena; only one casts a shadow. True Sight reveals him.',
    myth: 'Moha is confusion about what is real and what is precious. The Upanishads call the world of appearances a veiling power (avarana-shakti). Delusion is not defeated by force but by seeing.',
  },
  {
    day: 4, id: 'lobha', name: 'Lobhasura', deva: 'लोभासुर', title: 'Demon of Greed',
    vice: 'Lobha · Greed', color: '#ffd166', color2: '#5a4210', arena: 'The Vault of Cursed Gold',
    hp: 1000, phases: 3, size: 1.15,
    taunt: 'Everything in this room is mine. Including the sweetness you carry. Hand it over — I will still want more.',
    defeat: 'More… just a little… more…',
    weakness: 'He swallows your modaks and grows. Deny him; then Pull the gold shield from his belly.',
    myth: 'Lobha is appetite that has forgotten the word "enough". Gita 16.21 names greed one of the three gates of hell — not because wealth is evil, but because the hunger for more devours the one who carries it.',
  },
  {
    day: 5, id: 'krodha', name: 'Krodhasura', deva: 'क्रोधासुर', title: 'Demon of Rage',
    vice: 'Krodha · Anger', color: '#ff6b3d', color2: '#5a1408', arena: 'The Mouth of the Volcano',
    hp: 1120, phases: 4, size: 1.18,
    taunt: 'BURN. BURN. I do not even remember what you did. I only remember that I want you to burn.',
    defeat: 'The fire… goes out… and I am still… ashamed.',
    weakness: 'Do not dodge his flame — swallow it. The Shield stores his fury and returns it.',
    myth: 'Krodha arises where kama is blocked; the Gita traces desire to anger to delusion to ruin (2.62–63). Anger is not extinguished by more anger. It is absorbed, held, and released as clarity.',
  },
  {
    day: 6, id: 'kama', name: 'Kamasura', deva: 'कामासुर', title: 'Demon of Unchecked Desire',
    vice: 'Kama · Desire', color: '#ff6fa5', color2: '#4d1030', arena: 'The Garden of Intoxicating Bloom',
    hp: 1180, phases: 3, size: 1.08,
    taunt: 'Why fight me? Everything you have ever wanted is in this garden. Take it. Take all of it. You will never be full, and that is the point.',
    defeat: 'You wanted… nothing? That is a weapon I have no defence against.',
    weakness: 'Her spores turn your own limbs against you. Vikata\u2019s Focus slows her dance enough to step between the petals.',
    myth: 'Kama is not evil — it is life. It becomes an asura when it is unchecked, when wanting replaces being. The garden is beautiful and it is a trap; both are true.',
  },
  {
    day: 7, id: 'mamata', name: 'Mamatasura', deva: 'ममतासुर', title: 'Demon of Attachment',
    vice: 'Mamata · Attachment', color: '#9fd8ff', color2: '#123048', arena: 'The Web That Will Not Let Go',
    hp: 1240, phases: 3, size: 1.25,
    taunt: 'Mine. My web, my children, my grief, my yesterday. Let go? If I let go, what is left of me?',
    defeat: 'Oh… it was lighter… than I was told…',
    weakness: 'She binds you and drains you. Phase out of the silk, then cut the anchor-threads.',
    myth: 'Mamata is "mine-ness" — the reflex that turns the world into possessions and people into property. Attachment is the thread that feels like safety and behaves like a snare.',
  },
  {
    day: 8, id: 'abhimana', name: 'Abhimanasura', deva: 'अभिमानासुर', title: 'Demon of Ego',
    vice: 'Abhimana · Ego', color: '#dfe8ff', color2: '#1b2444', arena: 'The Hall of Ten Thousand Mirrors',
    hp: 1320, phases: 4, size: 1.02,
    taunt: 'Look at them, Gajamukhasura. Every mirror holds the demon you were. Did you think a mouse costume would fool ME? I AM you.',
    defeat: 'Then strike… and end us… together…',
    weakness: 'He cannot be touched while you insist on being seen. Smoke Form — become nothing — and the mirrors have nothing to reflect.',
    myth: 'Abhimana is the "I-maker": the voice that claims every action as its own. It is the last vice because it wears the mask of virtue. It is not defeated by fighting it — only by ceasing to feed it.',
  },
  {
    day: 9, id: 'sindhu', name: 'Sindhu', deva: 'सिन्धु', title: 'The Invincible · Thief of Amrita',
    vice: 'The Ninth Gate · False Immortality', color: '#7fe8ff', color2: '#0a2c48', arena: 'The Ocean of Milk',
    hp: 1900, phases: 5, size: 1.55,
    taunt: 'I drank the nectar. Death itself has forgotten my name. Your little god cannot reach me here, at the edge of everything.',
    defeat: 'The bowl… breaks… and I am only… mortal…',
    weakness: 'Every one of the eight boons, chained without pause, strips his elemental guards. Then — the Parashu.',
    myth: 'In the Ganesha Purana, the asura Sindhu seizes the nectar of immortality (amrita). Vighnaraja rides into battle and, with his axe Parashu, cleaves open the demon\u2019s belly; the stolen nectar is shattered and released, and mortality returns to the one who tried to escape it. Immortality grasped by force is the final vice.',
  },
];

export const bossByDay = (d) => BOSSES.find((b) => b.day === d);

/* -------------------------------- VICES ---------------------------------- */
export const VICES = [
  { n: 'Matsara', deva: 'मत्सर', en: 'Jealousy', gate: 'The Marsh', line: 'The sorrow at another\u2019s light. It steals before it is asked.', cure: 'Mudita — joy in the joy of others.' },
  { n: 'Mada', deva: 'मद', en: 'Pride', gate: 'The Fortress', line: 'The armour of the self-important. It keeps everything out, including help.', cure: 'Vinaya — humility that is not smallness, but openness.' },
  { n: 'Moha', deva: 'मोह', en: 'Delusion', gate: 'The Labyrinth', line: 'Confusing the map for the territory, the body for the Self.', cure: 'Viveka — the discerning eye that sees what is.' },
  { n: 'Lobha', deva: 'लोभ', en: 'Greed', gate: 'The Mines', line: 'Appetite that has unlearned the word "enough".', cure: 'Santosa — contentment, the richest possession.' },
  { n: 'Krodha', deva: 'क्रोध', en: 'Anger', gate: 'The Volcano', line: 'Blocked desire turning outward as fire. Gita 2.62–63 traces the whole chain.', cure: 'Kshama — the strength to hold heat without becoming it.' },
  { n: 'Kama', deva: 'काम', en: 'Desire', gate: 'The Garden', line: 'Not evil — but a master that never pays its workers.', cure: 'Sanyama — restraint, the rein rather than the whip.' },
  { n: 'Mamata', deva: 'ममता', en: 'Attachment', gate: 'The Web', line: 'Mine-ness. The thread that feels like safety and behaves like a snare.', cure: 'Vairagya — non-clinging, which is not coldness but freedom.' },
  { n: 'Abhimana', deva: 'अभिमान', en: 'Ego', gate: 'The Mirrors', line: 'The I-maker, wearing the mask of every virtue you have earned.', cure: 'Niratva — acting without claiming the action.' },
  { n: 'Amrita-moha', deva: 'अमृत', en: 'False Immortality', gate: 'The Ocean', line: 'The refusal to be mortal. The last door, and the hardest.', cure: 'Sharana — surrender to what is larger than the self.' },
];

/* -------------------------------- STORY ---------------------------------- */
export const PROLOGUE = [
  { s: 'NARRATOR', t: 'Nine days remain before Ganesh Chaturthi. Across the land, clay is being shaped, marigold is being strung, and every household is preparing a seat for the Beloved.' },
  { s: 'NARRATOR', t: 'But something has gone wrong with the world. The lamps will not stay lit. The mantras come out hollow. The divine presence has been… <em>severed</em>.' },
  { s: 'MUSHIKA', t: 'Nine of them. Nine old Asuras, long bound, long forgotten — they have cut the thread between the realms. Each one rules a vice. Each one is waiting.' },
  { s: 'MUSHIKA', t: 'And I am a mouse. Small. Fast. Terrified.' },
  { s: 'GANESHA', cls: 'ganesha', t: '<span class="deva">मूषिक।</span> Come here, little one.' },
  { s: 'MUSHIKA', t: 'My Lord! I tried to reach you — the way is blocked, I could not—' },
  { s: 'GANESHA', cls: 'ganesha', t: 'I know. That is not the point. The point is that you tried, and you came back, and you told me the truth instead of a comfortable story.' },
  { s: 'GANESHA', cls: 'ganesha', t: 'They have barred my presence from the mortal realm. They cannot bar my <em>grace</em>. Every demon you face, I will answer with a boon — a part of myself, lent to you.' },
  { s: 'MUSHIKA', t: 'And if I fail?' },
  { s: 'GANESHA', cls: 'ganesha', t: 'Then you will rise again. That is the whole of the practice. <span class="deva">उद्धरेदात्मनात्मानम्</span> — raise yourself by your own Self.' },
  { s: 'NARRATOR', t: 'But there is one thing Mushika has not said aloud. Once, in an age before this one, he was not a mouse.' },
  { s: 'NARRATOR', t: 'He was <strong>Gajamukhasura</strong> — an arrogant demon of terrible power, who marched on the heavens and was humbled by Ganesha himself. Bound into this small body, he was made the Lord\u2019s vehicle… and given a second chance he has never felt worthy of.' },
  { s: 'MUSHIKA', t: 'Nine vices. I used to be all of them. …That is exactly why it has to be me.' },
  { s: 'NARRATOR', t: '<strong>Mushika\u2019s Quest: Nine Days of Dharma.</strong> The first diya is lit. The marsh is waiting.' },
];

/** short pre-boss beats per day (shown after the level, before the arena) */
export const PRE_BOSS = {
  1: [{ s: 'MATSARASURA', cls: 'asura', t: 'There you are. Carrying sweets for a god who does not even look at you. Do you know how much that hurts <em>me</em>?' }, { s: 'MUSHIKA', t: 'You are jealous of a mouse.' }, { s: 'MATSARASURA', cls: 'asura', t: 'I am jealous of everything that is loved!' }],
  2: [{ s: 'MADASUREA', cls: 'asura', t: 'A rat in my throne room. My grandfather would have had you flayed. I shall simply not notice you until you die of the not-noticing.' }, { s: 'MUSHIKA', t: 'That is a lot of armour for someone who is scared of something so small.' }, { s: 'MADASURA', cls: 'asura', t: 'SCARED?!' }],
  3: [{ s: 'MOHASURA', cls: 'asura', t: 'Welcome to the labyrinth. It has nine exits. Eight of them are me. Which truth would you like to be destroyed by?' }, { s: 'MUSHIKA', t: 'My Lord gave me a boon for exactly this. I do not need your truths — I need the real one.' }],
  4: [{ s: 'LOBHASURA', cls: 'asura', t: 'Ooooh. A <em>collector</em>. I can smell it — modaks, devotion, merit. Put it in the vault. Everything goes in the vault. I am only keeping it safe.' }, { s: 'MUSHIKA', t: 'You are already so big. Are you not full?' }, { s: 'LOBHASURA', cls: 'asura', t: 'FULL? That word does not exist in here.' }],
  5: [{ s: 'KRODHASURA', cls: 'asura', t: 'AAAAAAAA—' }, { s: 'MUSHIKA', t: 'He is not even listening.' }, { s: 'KRODHASURA', cls: 'asura', t: '—AND ANOTHER THING—' }],
  6: [{ s: 'KAMASURA', cls: 'asura', t: 'Little mouse. You have run so far and you are so very tired. Rest here. Whatever you want — it is already blooming.' }, { s: 'MUSHIKA', t: 'It smells wonderful. That is how I know it is a trap.' }],
  7: [{ s: 'MAMATASURA', cls: 'asura', t: 'Do not struggle. Everyone who comes here eventually stops struggling. I keep them all — every memory, every loss, every name. Mine. All mine.' }, { s: 'MUSHIKA', t: 'You are not keeping them. You are keeping <em>yourself</em> from letting go.' }],
  8: [{ s: 'ABHIMANASURA', cls: 'asura', t: 'Gajamukhasura.' }, { s: 'MUSHIKA', t: '…I have not heard that name in a very long time.' }, { s: 'ABHIMANASURA', cls: 'asura', t: 'Of course not. You became small and called it holiness. Look around — every mirror here remembers what you were. I am the part of you that enjoyed it.' }, { s: 'MUSHIKA', t: 'Then you already know how this ends. I have been defeating you my whole life.' }],
  9: [{ s: 'SINDHU', cls: 'asura', t: 'So. The vehicle arrives. Eight demons and you are still standing — I confess I expected the marsh to finish you.' }, { s: 'MUSHIKA', t: 'You drank the amrita. You stole the nectar that belongs to every living thing.' }, { s: 'SINDHU', cls: 'asura', t: 'I <em>took</em> what was offered to gods alone, and now no weapon in the three worlds can end me. Go home, mouse. Tell your master that death has moved out of my reach.' }, { s: 'MUSHIKA', t: 'No. I think I will open you up and give it back.' }],
};

/** spoken by Ganesha in the boon ceremony (shloka + line) */
export const BLESSINGS = {
  1: { s: SHLOKAS.vakra, line: 'Jealousy is the eye that can only look sideways. Take my broken tusk — it was given away, and in being given it became a weapon of light. Throw it, and it will always come home.' },
  2: { s: SHLOKAS.gayatri, line: 'Pride is a wall that believes it is a crown. I broke one tusk to write the Mahabharata; break one wall to reach a soul. Run at it. Do not slow down.' },
  3: { s: SHLOKAS.gajananam, line: 'Delusion cannot be fought, only seen through. Open the third eye. What is real will hold your weight; what is not, was never standing there.' },
  4: { s: SHLOKAS.vakra, line: 'Greed hoards; devotion reaches. My trunk does not grasp — it draws near. Pull what is lost back to where it belongs. Including yourself.' },
  5: { s: SHLOKAS.gayatri, line: 'Anger is enormous energy with no direction. Do not answer it with fire. Hold it, and give it back as light. That is the whole of the practice.' },
  6: { s: SHLOKAS.gajananam, line: 'Desire moves faster than thought. So do not race it — slow the world instead, and step between the moments. Restraint is not weakness. It is timing.' },
  7: { s: SHLOKAS.trividham, line: 'Attachment tightens its grip the harder you pull. Become untouchable for one breath and the web simply… has nothing to hold. Let go, and walk through.' },
  8: { s: SHLOKAS.uddharet, line: 'Ego is defeated the moment you stop insisting on being seen. Become smoke. Be nobody, in the holiest way, and every mirror in this hall will go dark.' },
  9: { s: SHLOKAS.nainam, line: 'You have carried eight pieces of me and never once asked for the ninth. That is why you may hold the axe. Now — open him, and give the nectar back to the world.' },
};

export const EPILOGUE = [
  { s: 'NARRATOR', t: 'The axe falls. The bowl of stolen nectar shatters inside Sindhu\u2019s belly, and the amrita — hoarded for one — pours out into the ocean, into the rain, into every living thing that was ever denied it.' },
  { s: 'NARRATOR', t: 'The ninth gate closes. Across the mortal realm, ten million lamps decide, all at once, to stay lit.' },
  { s: 'MUSHIKA', t: 'It is done, my Lord. The thread is whole. You can come home now.' },
  { s: 'GANESHA', cls: 'ganesha', t: 'I never left, little one. I was only ever where the devotion was. Which is to say — I was standing exactly where you were standing.' },
  { s: 'MUSHIKA', t: 'Then what was the quest for?' },
  { s: 'GANESHA', cls: 'ganesha', t: 'So that <em>you</em> would find out where I was.' },
  { s: 'NARRATOR', t: 'On the fourth day of the bright fortnight, the clay idol is carried in. The elephant face is painted, the mouse is placed at his feet, and the whole world shouts one name.' },
  { s: 'NARRATOR', t: '<span class="deva">गणपति बाप्पा मोरया!</span>' },
  { s: 'MUSHIKA', t: 'And the mouse — who was once the proudest demon in the three worlds — sits at the feet of his Lord, small, quiet, and finally, entirely, home.' },
];

/* --------------------------------- CODEX --------------------------------- */
export const CODEX_STORY = `
<h4>The severing</h4>
<p>Nine days before Ganesh Chaturthi, a coalition of nine ancient Asuras — each one the embodiment of a single human vice — cuts the thread between the mortal realm and the divine. Ganesha's <em>presence</em> is barred from the world. His <em>grace</em>, however, cannot be barred: it flows wherever devotion flows.</p>
<h4>The vehicle</h4>
<p>So the quest falls to the smallest devotee in the pantheon: Mushika, the mouse who carries the Lord. In several Puranic retellings, Ganesha's vahana was not always a mouse — he was <strong>Gajamukhasura</strong>, a proud and terrible demon who marched against the heavens, was humbled by Ganesha, and was given this small body and this second chance. Every vice he now hunts, he once embodied. The redemption arc is not decoration; it is the reason the story works.</p>
<h4>The loop</h4>
<p>Each day is a realm, each realm is a vice, each vice is guarded by an Asura. Defeating an Asura earns a <strong>Divine Boon</strong> — a permanent new ability drawn from a real aspect of Ganesha's iconography — which is then required to traverse and conquer the next realm. This is the metroidvania loop, mapped one-to-one onto a spiritual practice: the power you earn is always the virtue that defeats the vice you just faced.</p>
<h4>The ninth day</h4>
<p>In the <em>Ganesha Purana</em>, the asura <strong>Sindhu</strong> seizes the nectar of immortality (amrita). Vighnaraja rides to battle him, and with his battle-axe <strong>Parashu</strong> he cleaves open the demon's belly, shattering the stolen nectar and returning mortality to the one who tried to escape it. This is the finale of the game — a puzzle-boss that demands all eight boons chained together, ended by a single, cinematic axe-blow.</p>
<div class="cx-quote">${SHLOKAS.vakra.deva.replace(/\n/g, '<br>')}<small>${SHLOKAS.vakra.tr}</small></div>
`;

export const CODEX_MUSHIKA = `
<h4>Name &amp; nature</h4>
<p><strong>Mushika</strong> (मूषिक) simply means "mouse". In iconography he is shown beneath Ganesha's foot or carrying him — the enormous mounted on the small. Commentators read this constantly and in many directions: the infinite riding on the finite; wisdom mastered by, and riding upon, the restless mind; the ego subdued into service.</p>
<h4>Gameplay translation</h4>
<p>The game takes that reading literally. Mushika is tiny — a small hitbox, low base damage, and enormous agility. He survives by speed, by dodging, by knowing when to run. His power does not scale with size but with <strong>Bhakti (devotion)</strong>: a meter that fills as he fights bravely, explores generously, and refuses to give up. Bhakti is what pays for the Divine Boons. In other words: the mechanic that powers you is the one you cannot buy or hoard.</p>
<h4>The Gajamukhasura thread</h4>
<p>Between realms, Mushika is confronted by his own past. Day 8 — the Hall of Mirrors — is designed as the emotional climax before the finale: an invincible enemy that wears his old face and taunts him with everything he used to enjoy being. The only way past it is Dhumravarna's Smoke Form: to stop insisting on being seen. Ego is not defeated by force. It is defeated by withdrawal of the audience.</p>
<h4>What the mouse teaches</h4>
<p>That the smallest creature in the story was chosen to carry the largest. That devotion outranks power. That a second chance is not a consolation prize — it is the entire point.</p>
`;

export const CREDITS = [
  { h: '', p: 'MUSHIKA\u2019S QUEST', cls: 'big' },
  { h: '', p: 'Nine Days of Dharma' },
  { h: 'A Game By', p: 'MYTHIC DEVELOPERS', cls: 'big' },
  { h: 'A Tribute', p: 'Made with reverence for the mythology of Shri Ganesha,<br>and with love for the action-platformers that raised us.' },
  { h: 'Design · Code · Art · Audio', p: 'A college project — every pixel, particle and note<br>procedurally generated in-browser. No art assets. No audio files.' },
  { h: 'The Nine Asuras', p: 'Matsarasura · Madasura · Mohasura · Lobhasura · Krodhasura<br>Kamasura · Mamatasura · Abhimanasura · Sindhu' },
  { h: 'The Eight Boons', p: 'Vakratunda · Ekadanta · Mahodara · Gajanana<br>Lambodara · Vikata · Vighnaraja · Dhumravarna' },
  { h: 'Ragas Heard In This Game', p: 'Yaman · Durga · Bhairav · Malkauns · Marwa · Bhairavi<br><em>synthesised live with the Web Audio API</em>' },
  { h: 'Sources', p: 'Ganesha Purana · Mudgala Purana · Bhagavad Gita<br>Bhaja Govindam · traditional Ganesha stotras' },
  { h: 'Invocation', cls: 'deva', p: SHLOKAS.vakra.deva.replace(/\n/g, '<br>') },
  { h: '', p: SHLOKAS.vakra.tr, cls: '' },
  { h: 'Thank You For Playing', p: 'गणपति बाप्पा मोरया', cls: 'deva' },
];
