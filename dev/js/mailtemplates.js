/* Letter helper (parent-only, lives inside the compose overlay).
 *
 * Six letter types. Each asks the parent a few real-detail questions, then
 * drafts a warm, natural letter into the compose fields — still fully
 * editable before sending. Sentences are drawn from large randomized banks
 * and the parent's details are woven in, so no two letters read the same.
 *
 * Writing guidance baked into every bank (age 3-4): name the feeling, praise
 * effort over outcome, describe the behavior — never the child — as the
 * problem, always end with belief in her and a next step. Detail answers
 * should be written TO her ("you shared your toys"), and the placeholders
 * demonstrate that. */
const MailTemplates = (() => {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const name = () => Hub.name;

  /* Embed a parent-typed detail mid-sentence: trim, drop a trailing period,
   * lowercase a capitalized first word (unless it looks like a name). */
  function weave(s) {
    s = (s || '').trim().replace(/[.!\s]+$/, '');
    if (/^[A-Z][a-z]/.test(s) && !s.startsWith(name())) {
      s = s[0].toLowerCase() + s.slice(1);
    }
    return s;
  }
  const given = (s) => (s || '').trim().length > 0;

  const SIGNOFFS = [
    'Your friend,\nRyder\nPAW Patrol Rescue HQ',
    'So proud to be your friend,\nRyder\nPAW Patrol Rescue HQ',
    'From all of us at the tower,\nRyder and the pups\nPAW Patrol Rescue HQ',
    'Yelp for help anytime,\nRyder\nPAW Patrol Rescue HQ',
  ];

  const TYPES = [
    {
      key: 'praise',
      label: 'Praise for…',
      desc: 'She did something great and HQ noticed',
      hint: 'Write the details to her — like "you shared your toys with your cousin".',
      questions: [
        { id: 'what', label: 'What did she do?', ph: 'you shared your toys with your cousin', req: true },
        { id: 'when', label: 'Where or when was this? (optional)', ph: 'at Grandma’s house today' },
        { id: 'who', label: 'Who saw it or was helped? (optional)', ph: 'your cousin was so happy' },
      ],
      subjects: [
        'A gold star message for {n}!',
        'The pups are cheering for you!',
        'HQ heard something wonderful',
        'Great work, Ranger {n}!',
        'This made the whole tower smile',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `Big news travels fast at Rescue HQ — and today the big news was YOU. We heard that ${weave(a.what)}${given(a.when) ? ', ' + weave(a.when) : ''}!`,
          `The lookout telescope spotted something wonderful${given(a.when) ? ' ' + weave(a.when) : ''}: ${weave(a.what)}. The whole tower cheered!`,
          `A little bird — okay, it was Skye — flew in with amazing news: ${weave(a.what)}${given(a.when) ? ', ' + weave(a.when) : ''}. Everyone stopped what they were doing to celebrate!`,
        ]));
        if (given(a.who)) {
          p.push(pick([
            `And here is the best part: ${weave(a.who)}. When you do something kind or brave, it doesn't just help you — it makes someone else's whole day brighter. That is a real rescue-pup superpower.`,
            `We also heard that ${weave(a.who)}. Did you know that helping hearts make other hearts happy? That is exactly how the PAW Patrol works, too.`,
          ]));
        }
        p.push(pick([
          `Doing something like that takes a big warm heart, and you have one. Pups who act like that grow up strong, kind, and trusted by everyone — and you are already on your way.`,
          `That was not luck — that was YOU choosing to do the right thing. Choosing well is what makes a great rescue pup, and you chose like a champion.`,
          `Remember this feeling in your chest right now? That warm, sparkly feeling is what doing good feels like. The more you do it, the stronger it grows — just like a muscle.`,
        ]));
        p.push(pick([
          `Keep it up, and keep being you. We are so lucky you are on our team.`,
          `Tonight when you go to sleep in your very own bed, you can smile and think: "I did something great today." Because you did.`,
          `We put a note about this on the big board in the tower so every pup can see it. Keep shining!`,
        ]));
        return p;
      },
    },
    {
      key: 'proud',
      label: 'Proud because…',
      desc: 'She worked hard at something — effort worth celebrating',
      hint: 'Effort counts more than the result — tell us what she kept trying at.',
      questions: [
        { id: 'what', label: 'What is HQ proud of?', ph: 'you slept in your own bed all night', req: true },
        { id: 'effort', label: 'How did she work at it? (optional)', ph: 'you kept trying even when it was hard' },
        { id: 'next', label: 'What could be next for her? (optional)', ph: 'doing it two nights in a row' },
      ],
      subjects: [
        'HQ is SO proud of you, {n}',
        'You did it, {n}!',
        'The proudest day at the tower',
        'A very proud message from Ryder',
        'Look what you did!',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `I called all the pups together this morning for a special announcement: ${weave(a.what)}! The tower got SO loud with happy barking.`,
          `Sometimes news is so good I have to sit down. Today was one of those days, because ${weave(a.what)}. WOW.`,
          `Guess whose name is written in gold on the mission board today? Yours — because ${weave(a.what)}.`,
        ]));
        if (given(a.effort)) {
          p.push(pick([
            `And do you know what makes us proudest? Not just that you did it — but that ${weave(a.effort)}. Trying again and again, even when something is hard, is called perseverance. It is the most powerful tool any pup has. More powerful than Rubble's digger!`,
            `The part that made Ryder smile biggest: ${weave(a.effort)}. Big things are never done in one giant leap — they are done one small brave try at a time. You know that secret now, and it will help you your whole life.`,
          ]));
        } else {
          p.push(pick([
            `Things like this don't happen by magic. They happen because somebody keeps trying, even on the hard days. That somebody was you. That is called perseverance, and it is a real superpower.`,
            `Every big thing is really lots of little brave tries stacked up. You stacked your brave tries all the way to the top — and look what happened!`,
          ]));
        }
        if (given(a.next)) {
          p.push(pick([
            `When you are ready for your next mission, we already know a great one: ${weave(a.next)}. No rush — champions rest, then try the next thing.`,
            `Here is a fun thought for later: maybe soon, ${weave(a.next)}. If anyone can, it's you.`,
          ]));
        }
        p.push(pick([
          `We are proud of you today, tomorrow, and always.`,
          `Stand tall, Ranger. Today the whole tower is proud of you.`,
          `You make our team better just by being on it.`,
        ]));
        return p;
      },
    },
    {
      key: 'disappointed',
      label: 'A little disappointed because…',
      desc: 'A gentle note about a hard moment — kind but honest',
      hint: 'Keep it about the moment, not about her. The letter stays gentle.',
      questions: [
        { id: 'what', label: 'What happened?', ph: 'you didn’t use your listening ears at dinner', req: true },
        { id: 'hoped', label: 'What did we hope for instead? (optional)', ph: 'coming to the table the first time you were called' },
      ],
      subjects: [
        'A gentle note from HQ',
        'A quiet word from Ryder',
        'About today, {n}',
        'HQ needs to tell you something',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `This is a quiet kind of letter, the kind I write with a soft voice. Today we felt a little disappointed, because ${weave(a.what)}.`,
          `Even rescue pups have wobbly days, and today had a wobble: ${weave(a.what)}. We felt a little sad about it, and we think you might have too.`,
          `I want to tell you something honestly, because that is what friends do: ${weave(a.what)}, and it made us feel a little disappointed.`,
        ]));
        p.push(pick([
          `Disappointed is a feeling, and feelings are okay to have — even the squishy uncomfortable ones. Being a little disappointed does NOT mean we love you less. Nothing could ever mean that.`,
          `Do you know what disappointed means? It means we know how wonderful you are, and today's choice wasn't the wonderful-you kind of choice. The wonderful you is still right there — we saw her this morning!`,
        ]));
        if (given(a.hoped)) {
          p.push(pick([
            `What we were hoping for was ${weave(a.hoped)}. That is still the mission, and we know you can do it — we have seen you do hard things before.`,
            `Next time, the winning move looks like this: ${weave(a.hoped)}. Picture it like a mission on the board. You have completed harder ones!`,
          ]));
        }
        p.push(pick([
          `Here is the best news: tomorrow is a brand-new page, totally blank, ready for a better day. Every pup gets one. We can't wait to watch you fill it.`,
          `Hard moments don't stick to pups who keep trying — they slide right off, like rain off a raincoat. Tomorrow we start fresh, together.`,
          `Tonight, let's take one big Moonbeam Breath, let today go, and get ready for a brand-new try tomorrow. We believe in you completely.`,
        ]));
        return p;
      },
    },
    {
      key: 'unhappy',
      label: 'Not happy with you because of…',
      desc: 'A firmer letter for a real misstep — still full of love',
      hint: 'The letter is firm about the behavior but never about her.',
      questions: [
        { id: 'what', label: 'What happened?', ph: 'you hit your brother when you were angry', req: true },
        { id: 'why', label: 'Why does it matter / who was hurt? (optional)', ph: 'it hurt him and made him cry' },
        { id: 'instead', label: 'What should she do next time? (optional)', ph: 'use your words and ask a grown-up for help' },
      ],
      subjects: [
        'An important letter from Ryder',
        'HQ is not happy today',
        'We need to talk, {n}',
        'A serious message from the tower',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `This letter is a serious one, so I will say it plainly, the way I do at the big table: we are not happy about what happened today. ${weave(a.what).charAt(0).toUpperCase() + weave(a.what).slice(1)}.`,
          `Today something happened that HQ cannot cheer for: ${weave(a.what)}. We are not happy about it, and it is important that you know.`,
        ]));
        if (given(a.why)) {
          p.push(pick([
            `Here is why it matters so much: ${weave(a.why)}. Our choices land on other people, like ripples in the bay. Rescue pups are careful with their ripples.`,
            `We want you to understand the why, not just the rule: ${weave(a.why)}. When we understand why, we get strong enough to choose better.`,
          ]));
        }
        p.push(pick([
          `Now listen carefully to this part, because it is the most important part: we are not happy with what happened — but we are ALWAYS happy that you are you. You are not a bad pup. You made a choice that wasn't okay, and choices can be fixed.`,
          `Hear this loud and clear: it is the BEHAVIOR we are upset with, never you. You are our girl, always. That is exactly why we tell you the truth when something isn't okay.`,
        ]));
        if (given(a.instead)) {
          p.push(pick([
            `Next time, here is the rescue-pup way: ${weave(a.instead)}. That is what the bravest pups do — and it works.`,
            `So what is the plan for next time? ${weave(a.instead).charAt(0).toUpperCase() + weave(a.instead).slice(1)}. Practice it with us tonight — even heroes practice.`,
          ]));
        }
        p.push(pick([
          `Fixing things usually starts with a kind "I'm sorry" and a gentle try again. We know you have both inside you. Show us tomorrow — we will be watching with hopeful eyes and open arms.`,
          `Tomorrow you get the chance every pup gets: to make it right and choose better. We already believe you will. No job is too big, no pup is too small — especially not for fixing a mistake.`,
        ]));
        return p;
      },
    },
    {
      key: 'warning',
      label: 'Warning for…',
      desc: 'An official HQ notice — a behavior needs to turn around',
      hint: 'Say what the behavior is and what happens if it keeps going.',
      questions: [
        { id: 'what', label: 'What is the warning for?', ph: 'not staying in your own bed at night', req: true },
        { id: 'consequence', label: 'What happens if it continues? (optional)', ph: 'a sad face on your Daily Monitor' },
        { id: 'fix', label: 'How can she turn it around? (optional)', ph: 'stay cozy in your bed all night tonight' },
      ],
      subjects: [
        'OFFICIAL NOTICE from Rescue HQ',
        'A warning from the tower, {n}',
        'Important: HQ notice for {n}',
        'Ranger {n} — please read carefully',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `This is an official notice from Rescue HQ, stamped with the big paw stamp, which means it is important. This is a warning about ${weave(a.what)}.`,
          `Ranger ${name()}, this letter comes with the serious HQ seal on it. The tower has noticed ${weave(a.what)}, and it needs to change.`,
        ]));
        p.push(pick([
          `A warning is not a punishment — it is a flashlight. It shines on a problem while there is still time to fix it. That is why we are telling you now, clearly and kindly.`,
          `Every rescue pup gets a warning sometimes. A warning means: stop, look, and turn around — you still have time to make it right. That is good news, if you use it.`,
        ]));
        if (given(a.consequence)) {
          p.push(pick([
            `Here is what happens if it keeps going: ${weave(a.consequence)}. We really don't want that — and we don't think you do either.`,
            `We will be honest about what comes next if this continues: ${weave(a.consequence)}. Rules at HQ are real, because rules keep every pup safe and strong.`,
          ]));
        }
        if (given(a.fix)) {
          p.push(pick([
            `And here is exactly how to turn it around: ${weave(a.fix)}. Do that, and this warning melts away like snow in the sun.`,
            `The turnaround mission is simple and we KNOW you can do it: ${weave(a.fix)}. Complete that mission and this notice tears itself right up.`,
          ]));
        }
        p.push(pick([
          `We are on your side — warnings and all. Show us the turnaround, Ranger. We will be the first ones cheering.`,
          `We believe in you one hundred percent. Pups fix things — that is what we do. Let's see it, ${name()}.`,
        ]));
        return p;
      },
    },
    {
      key: 'workon',
      label: 'Let’s work on this…',
      desc: 'A team mission: pick a skill and a tiny first step',
      hint: 'Small steps win. Name the skill and one tiny thing to try.',
      questions: [
        { id: 'what', label: 'What should you two work on?', ph: 'using listening ears the first time', req: true },
        { id: 'step', label: 'One small step to try? (optional)', ph: 'tonight, come when Mommy calls one time' },
        { id: 'reward', label: 'How will we celebrate progress? (optional)', ph: 'a happy face on your monitor and a big dance party' },
      ],
      subjects: [
        'A brand-new mission for {n}',
        'Team {n} + HQ: new mission!',
        'Mission briefing for Ranger {n}',
        'Let’s do this together, {n}',
      ],
      build(a) {
        const p = [];
        p.push(pick([
          `Every great pup trains at something, and today HQ has picked our next training mission together: ${weave(a.what)}. Notice that word — TOGETHER. You will not be doing this alone.`,
          `Mission briefing! Gather close. Our new team mission is: ${weave(a.what)}. Chase trains at sniffing, Marshall trains at ladders, and you and your family will train at this — as a team.`,
        ]));
        p.push(pick([
          `Here is a secret the pups learned a long time ago: nobody is good at something on day one. Not even Ryder. We get good by practicing a tiny bit, every day, and being patient with ourselves when we wobble.`,
          `Learning something new is like lighting the beacon — one small warm breath at a time, until suddenly the whole lamp is glowing. Tiny steps are how every big light gets lit.`,
        ]));
        if (given(a.step)) {
          p.push(pick([
            `Your very first tiny step is this: ${weave(a.step)}. That's it. Just that one small thing. Small steps are how rescue pups climb big mountains.`,
            `Step one of the mission — and it is a small one on purpose: ${weave(a.step)}. Do it once, and the mission has officially begun!`,
          ]));
        }
        if (given(a.reward)) {
          p.push(pick([
            `And when you make progress? ${weave(a.reward).charAt(0).toUpperCase() + weave(a.reward).slice(1)}! Every bit of progress deserves a celebration, because trying is the real winning.`,
            `We celebrate progress at HQ, so hear this: ${weave(a.reward)}. Wobbles don't cancel celebrations — trying earns them.`,
          ]));
        }
        p.push(pick([
          `We are your team, today and every day. Let's take the first step — paw in hand.`,
          `Mission accepted? We thought so. Go get 'em, Ranger ${name()}.`,
          `You bring the brave, we bring the cheering. Deal? Deal.`,
        ]));
        return p;
      },
    },
  ];

  let activeType = null;

  function fillSubject(t) {
    return pick(t.subjects).replace('{n}', name());
  }

  function openPicker() {
    const list = document.getElementById('tpl-list');
    list.innerHTML = '';
    TYPES.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'tpl-item';
      b.innerHTML = `<span class="tpl-item-label">${t.label}</span>` +
                    `<span class="tpl-item-desc">${t.desc}</span>`;
      b.addEventListener('click', () => openForm(t));
      list.appendChild(b);
    });
    document.getElementById('tpl-picker').classList.remove('hidden');
  }

  function openForm(t) {
    activeType = t;
    document.getElementById('tpl-picker').classList.add('hidden');
    document.getElementById('tpl-form-title').textContent = t.label.replace(/…$/, '');
    document.getElementById('tpl-form-hint').textContent = t.hint;
    const host = document.getElementById('tpl-questions');
    host.innerHTML = '';
    t.questions.forEach((q) => {
      const lab = document.createElement('label');
      lab.className = 'tpl-q-label';
      lab.textContent = q.label;
      const inp = document.createElement('textarea');
      inp.rows = 2;
      inp.id = 'tplq-' + q.id;
      inp.placeholder = q.ph;
      host.appendChild(lab);
      host.appendChild(inp);
    });
    document.getElementById('tpl-form').classList.remove('hidden');
    const first = host.querySelector('textarea');
    if (first) setTimeout(() => first.focus(), 150);
  }

  function generate() {
    const t = activeType;
    if (!t) return;
    const answers = {};
    let ok = true;
    t.questions.forEach((q) => {
      const v = document.getElementById('tplq-' + q.id).value;
      answers[q.id] = v;
      if (q.req && !given(v)) {
        document.getElementById('tplq-' + q.id).classList.add('tpl-missing');
        ok = false;
      }
    });
    if (!ok) return;
    const paragraphs = t.build(answers);
    const body = `Dear ${name()},\n\n` + paragraphs.join('\n\n') + '\n\n' + pick(SIGNOFFS);
    document.getElementById('compose-subject').value = fillSubject(t);
    document.getElementById('compose-text').value = body;
    document.getElementById('tpl-form').classList.add('hidden');
    activeType = null;
    Sounds.chime();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('compose-tpl-btn').addEventListener('click', openPicker);
    document.getElementById('tpl-picker-close').addEventListener('click', () =>
      document.getElementById('tpl-picker').classList.add('hidden'));
    document.getElementById('tpl-form-back').addEventListener('click', () => {
      document.getElementById('tpl-form').classList.add('hidden');
      openPicker();
    });
    document.getElementById('tpl-generate').addEventListener('click', generate);
    document.getElementById('tpl-questions').addEventListener('input', (e) => {
      if (e.target.tagName === 'TEXTAREA') e.target.classList.remove('tpl-missing');
    });
  });

  return {};
})();
