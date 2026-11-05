import { describe, expect, it } from 'vitest';
import { SKYLINE } from '../src/levels/skyline/course';
import { interpolate, Motion, route } from '../src/levels/skyline/motion';
import { hits, SkylineRunner } from '../src/levels/skyline/runner';
import { LANES } from '../src/levels/skyline/types';
const advance = (r: SkylineRunner, seconds: number) => { for(let i=0;i<Math.round(seconds*60);i++) r.update(1/60); };

describe('four-direction skyline', () => {
  it('waits for a swipe, then continues without input', () => {
    const r=new SkylineRunner(SKYLINE), before=r.snapshot; advance(r,2); expect(r.snapshot).toEqual(before);
    r.swipe('up'); advance(r,SKYLINE.duration+1); expect(r.snapshot.complete).toBe(true);
  });
  it('keeps lane and mode independent and clamps the outer lanes', () => {
    const r=new SkylineRunner(SKYLINE); r.swipe('left'); r.swipe('left'); expect(r.snapshot.lane).toBe(-1);
    r.swipe('down'); expect(r.snapshot.lane).toBe(-1); expect(r.snapshot.requestedMode).toBe('run');
    r.swipe('right'); r.swipe('right'); expect(r.snapshot.lane).toBe(1); expect(r.snapshot.mode).toBe('run');
    r.swipe('up'); expect(r.snapshot.lane).toBe(1); expect(r.snapshot.mode).toBe('swing');
  });
  it('matches position, velocity and acceleration at curve boundaries', () => {
    const from={p:2,v:-3,a:4}, to={p:-6,v:2,a:-1};
    for(const [t,want] of [[0,from],[.8,to]] as const) {
      const s=interpolate(from,to,.8,t); for(const key of ['p','v','a'] as const) expect(s[key]).toBeCloseTo(want[key],8);
    }
  });
  it.each(LANES)('runs and swings in lane %s until the player changes mode', lane => {
    const m=new Motion(SKYLINE); m.select(lane,0,'run');
    for(const t of [2,5,11,14,20,30]) { const s=m.sample(t); expect(s.p.y).toBe(SKYLINE.groundY); expect(s.p.x).toBe(lane*SKYLINE.laneWidth); }
    m.select(lane,30,'swing'); expect(m.sample(32).p.y).toBeGreaterThan(4);
  });
  it('replans a double lane swipe and a vertical reversal without snapping', () => {
    const r=new SkylineRunner(SKYLINE); r.swipe('left'); advance(r,1); r.swipe('right'); advance(r,.1);
    let before=r.snapshot; r.swipe('right'); let after=r.snapshot;
    expect(after.lane).toBe(1);
    for(const key of ['p','v','a'] as const) for(const axis of ['x','y','z'] as const) expect(after[key][axis]).toBeCloseTo(before[key][axis],8);
    r.swipe('down'); advance(r,.3); before=r.snapshot; r.swipe('up'); after=r.snapshot;
    for(const key of ['p','v','a'] as const) for(const axis of ['x','y','z'] as const) expect(after[key][axis]).toBeCloseTo(before[key][axis],8);
  });
  it('repeated mode selections do not restart movement', () => {
    const a=new Motion(SKYLINE), b=new Motion(SKYLINE); a.select(0,0,'run'); b.select(0,0,'run');
    a.select(0,.3,'run'); expect(a.sample(.6)).toEqual(b.sample(.6));
  });
  it('keeps arbitrary changes above the floor and inside the corridor', () => {
    const m=new Motion(SKYLINE); let seed=42;
    for(let i=0;i<SKYLINE.duration*120;i++) {
      const t=i/120; seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      if(i%11===0) m.select(LANES[seed%3]!,t,seed%5<2?'run':'swing');
      const s=m.sample(t);
      expect(Number.isFinite(s.p.x+s.p.y+s.v.x)).toBe(true);
      expect(s.p.y).toBeGreaterThanOrEqual(SKYLINE.groundY-.002);
      expect(Math.abs(s.p.x)).toBeLessThanOrEqual(SKYLINE.laneWidth+2.51);
      expect(s.v.z).toBeGreaterThan(3.5);
      expect(s.v.z).toBeLessThan(SKYLINE.speed * 1.5);
    }
  });
  it('remembers up beneath a bridge and launches automatically after clearance', () => {
    // Derived from the bridge itself: a literal here silently stopped
    // meaning "under the bridge" the moment the route was rescaled.
    const bridge=SKYLINE.entities.find(e=>e.id==='bridge')!;
    const underBridge=bridge.z/SKYLINE.speed-1.2;
    const r=new SkylineRunner(SKYLINE); r.swipe('down'); advance(r,underBridge); r.swipe('up');
    expect(r.snapshot.pendingLaunch).toBe(true); expect(r.snapshot.requestedMode).toBe('swing');
    advance(r,.8); expect(r.snapshot.p.y).toBe(SKYLINE.groundY);
    advance(r,1.8); expect(r.snapshot.pendingLaunch).toBe(false); expect(r.snapshot.p.y).toBeGreaterThan(4);
    expect(r.entityStates.get('bridge')).not.toBe('hit');
  });
  it('down cancels a pending launch', () => {
    const bridge=SKYLINE.entities.find(e=>e.id==='bridge')!;
    const r=new SkylineRunner(SKYLINE); r.swipe('down'); advance(r,bridge.z/SKYLINE.speed-1.2);
    r.swipe('up'); r.swipe('down');
    advance(r,3); expect(r.snapshot.pendingLaunch).toBe(false); expect(r.snapshot.phase).toBe('run');
  });
  it('neither staying airborne nor staying grounded bypasses every encounter', () => {
    const air=new SkylineRunner(SKYLINE), ground=new SkylineRunner(SKYLINE);
    const past=(id:string)=>SKYLINE.entities.find(e=>e.id===id)!.z/SKYLINE.speed+1;
    const until=Math.max(past('bridge'),past('barricade'));
    air.swipe('up'); ground.swipe('down'); advance(air,until); advance(ground,until);
    expect(air.entityStates.get('bridge')).toBe('hit'); expect(ground.entityStates.get('barricade')).toBe('hit');
  });
  it('hits charge once and preserve forward travel and input', () => {
    const first=SKYLINE.entities.find(e=>e.kind==='hazard')!;
    const r=new SkylineRunner(SKYLINE); r.swipe('up'); advance(r,first.z/SKYLINE.speed+0.1);
    expect(r.events.filter(e=>e.t==='incident')).toHaveLength(1);
    const z=r.snapshot.p.z; r.swipe('right'); advance(r,.1);
    expect(r.snapshot.lane).toBe(1); expect(r.snapshot.p.z).toBeGreaterThan(z);
    expect(r.events.filter(e=>e.t==='incident')).toHaveLength(1);
  });
  it('tests actual 3D contacts, including clearance below and above obstacles', () => {
    const bridge=SKYLINE.entities.find(e=>e.id==='bridge')!;
    expect(hits({...bridge,z:bridge.z-10},{...bridge,z:bridge.z+10},bridge)).toBe(true);
    expect(hits({...bridge,y:1.25,z:bridge.z-10},{...bridge,y:1.25,z:bridge.z+10},bridge)).toBe(false);
    const ground=SKYLINE.entities.find(e=>e.id==='barricade')!;
    expect(hits({...ground,y:7,z:ground.z-10},{...ground,y:7,z:ground.z+10},ground)).toBe(false);
  });
  it('uses deterministic time and ignores invalid steps', () => {
    const a=new SkylineRunner(SKYLINE),b=new SkylineRunner(SKYLINE); a.swipe('down');b.swipe('down');
    for(let i=0;i<60;i++) a.update(1/60); for(let i=0;i<30;i++) b.update(1/30);
    a.update(NaN);a.update(-1);expect(a.snapshot).toEqual(b.snapshot);
    expect(route(SKYLINE,1,12,'run').p.y).toBe(SKYLINE.groundY);
  });
});
