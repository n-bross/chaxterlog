import test from "node:test";
import assert from "node:assert/strict";
import { readCounts, readDay, undoLastClick, isTrackEvent, type TrackEvent } from "./tracking.ts";
import { queueVisit, readRecords } from "./sync-state.ts";
import { latestRedo, redoLastClick, redoId, correctionEntries } from "./corrections.ts";

import type { Correction } from "./correction-types.ts";
const day = "2026-10-17";
function storage(): Storage {
  const data = new Map<string,string>();
  return { get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);},clear:()=>data.clear() };
}
const id = (i: number) => `e3d907b1-05aa-4eac-89a0-${String(i).padStart(12,"0")}`;
const visit = (i=1): TrackEvent => ({id:id(i),group:"u15",timestamp:`${day}T12:00:00.000Z`,order:i});
const action = (i: number,kind: "undo"|"redo",device="Tablet A"): Correction => ({id:id(i+100),kind,timestamp:`${day}T13:00:00.000Z`,order:i,userId:"operator",username:"team",deviceId:id(999),deviceName:device});
test("offline Undo/Redo chains retain original time, counts and every button press",()=>{
  const s=storage();queueVisit(s,visit());
  undoLastClick(s,day,action(1,'undo'));assert.deepEqual(readCounts(s,day),{u15:0,o15:0});
  const restored=redoLastClick(s,action(2,'redo'),day)!;
  assert.equal(restored.timestamp,visit().timestamp);assert.equal(restored.redoOf,visit().id);
  assert.deepEqual(readCounts(s,day),{u15:1,o15:0});assert.equal(latestRedo(s,day),null);
  undoLastClick(s,day,action(3,'undo'));
  const twice=redoLastClick(s,action(4,'redo'),day)!;
  assert.notEqual(twice.id,restored.id);assert.notEqual(twice.id,visit().id);
  assert.deepEqual(readCounts(s,day),{u15:1,o15:0});
  assert.deepEqual(correctionEntries(readRecords(s)).map(item=>item.kind),['redo','undo','redo','undo']);
});
test("Redo is newest-first, survives reload and stops when nothing remains",()=>{
  const s=storage();queueVisit(s,visit(1));queueVisit(s,{...visit(2),group:'o15'});
  undoLastClick(s,day,action(3,'undo'));undoLastClick(s,day,action(4,'undo'));
  assert.equal(latestRedo(s,day)?.id,visit(1).id);
  assert.equal(redoLastClick(s,action(5,'redo'),day)?.group,'u15');
  assert.equal(redoLastClick(s,action(6,'redo'),day)?.group,'o15');
  assert.equal(redoLastClick(s,action(7,'redo'),day),null);
  assert.deepEqual(readCounts(s,day),{u15:1,o15:1});
});
test("two devices restoring the same visit choose the same deterministic replacement",()=>{
  const a=storage(),b=storage();
  for(const s of [a,b]) { queueVisit(s,visit()); undoLastClick(s,day,action(1,'undo')); }
  const first=redoLastClick(a,action(2,'redo','Tablet A'),day)!;
  const second=redoLastClick(b,action(3,'redo','Tablet B'),day)!;
  assert.equal(first.id,second.id); assert.equal(first.id,redoId(visit().id));
});
test("failed Redo storage writes leave counts and eligibility untouched",()=>{
  const s=storage();queueVisit(s,visit());undoLastClick(s,day,action(1,'undo'));
  s.setItem=()=>{throw new Error('full');};
  assert.throws(()=>redoLastClick(s,action(2,'redo'),day));
  assert.deepEqual(readCounts(s,day),{u15:0,o15:0});assert.equal(latestRedo(s,day)?.id,visit().id);
});
test("malformed correction metadata is rejected and deterministic restored IDs are supported",()=>{
  assert.equal(isTrackEvent({...visit(),id:redoId(visit().id),redoOf:visit().id,corrections:[action(1,'redo')]}),true);
  assert.equal(isTrackEvent({...visit(),corrections:[{...action(1,'undo'),kind:'delete-all'}]}),false);
  assert.equal(isTrackEvent({...visit(),corrections:[{...action(1,'undo'),timestamp:'bad'}]}),false);
});
