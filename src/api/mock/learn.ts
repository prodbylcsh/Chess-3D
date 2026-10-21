// Mock Learn: lessons, the chapter reward and the unlock in the browser, with the server's rules.
import { t } from '../../i18n';
import { CHAPTER_REWARD, LEARN_PRICE, MIN_LESSON_MS, lessonOf, lessonOpen } from '#shared/learn.ts';
import { ApiError, type LearnProgress, type LearnService } from '../types';
import { GUEST_ID, db, emit, now, save, session, wait, type MockLearn } from './db';

const player = () => (db.sessionId ? session().profile : null);
const who = () => player()?.id ?? GUEST_ID;

export function learnOf(id: string): MockLearn {
  return (db.learn[id] ??= { lessons: {}, rewarded: [], unlocked: false });
}

const view = (l: MockLearn): LearnProgress => ({ lessons: Object.keys(l.lessons), unlocked: l.unlocked, rewarded: [...l.rewarded] });

export const learn: LearnService = {
  async progress() {
    await wait(100, 250);
    return view(learnOf(who()));
  },

  async done(lesson) {
    await wait(150, 300);
    const at = lessonOf(lesson);
    if (!at) throw new ApiError('bad_request', t('Something went wrong. Please try again.'));
    const profile = player();
    const l = learnOf(who());
    if (!profile && !at.chapter.free) throw new ApiError('guest_limit', t('Create a free account to keep going.'));
    if (!lessonOpen(lesson, Object.keys(l.lessons), l.unlocked)) throw new ApiError('locked', t('Finish the lessons before this one first.'));
    if (l.lessons[lesson]) return { first: false, chapterDone: false, reward: 0, ...view(l) };
    const last = Math.max(0, ...Object.values(l.lessons).map((at) => Date.parse(at)));
    if (Date.now() - last < MIN_LESSON_MS) throw new ApiError('too_fast', t('That was quick. Take the lesson again a little slower.'));
    l.lessons[lesson] = now();
    const chapterDone = at.chapter.lessons.every((id) => l.lessons[id]);
    let reward = 0;
    if (chapterDone && !l.rewarded.includes(at.chapter.id)) {
      l.rewarded.push(at.chapter.id);
      reward = CHAPTER_REWARD;
      if (profile) profile.coins += reward;
      else db.guest.coins += reward;
    }
    save();
    emit({ type: 'profile' });
    return { first: true, chapterDone, reward, ...view(l) };
  },

  async unlock() {
    await wait();
    const { profile } = session();
    const l = learnOf(profile.id);
    if (!l.unlocked) {
      if (profile.coins < LEARN_PRICE) throw new ApiError('insufficient_coins', t('You do not have enough coins for these chapters.'));
      profile.coins -= LEARN_PRICE;
      l.unlocked = true;
      save();
      emit({ type: 'profile' });
    }
    return view(l);
  },
};

/** A guest's lessons into the account (mock claim): the reward of a chapter the account had not finished. */
export function claimGuestLessons(profile: { id: string; coins: number }): number {
  const g = db.learn[GUEST_ID];
  if (!g) return 0;
  const l = learnOf(profile.id);
  const moved = Object.keys(g.lessons).filter((id) => !l.lessons[id]);
  for (const id of moved) l.lessons[id] = g.lessons[id];
  for (const chapter of g.rewarded) {
    if (l.rewarded.includes(chapter)) continue;
    l.rewarded.push(chapter);
    profile.coins += CHAPTER_REWARD;
  }
  delete db.learn[GUEST_ID];
  return moved.length;
}
