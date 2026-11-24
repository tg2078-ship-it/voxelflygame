import type { Input } from './types';

export type Lesson = 'bank' | 'throttle' | 'passage' | 'complete';
export interface CoachHUD { lesson: Lesson; progress: number; braking: boolean }
export class FlightSchool {
    lesson: Lesson = 'bank';
    private steering = 0;
    private boostTime = 0;
    private brakeTime = 0;
    advance(dt:number, input:Input, control:number, displacement:number) {
        if (this.lesson === 'bank') {
            if (Math.hypot(input.x,input.y)>.22) this.steering += displacement;
            if (this.steering>=5) this.lesson='throttle';
        } else if (this.lesson==='throttle') {
            if (this.boostTime<.5 && control>1) this.boostTime += dt;
            else if (this.boostTime>=.5 && control<1) this.brakeTime += dt;
            if (this.brakeTime>=.35) this.lesson='passage';
        }
    }
    pass() { if (this.lesson==='passage') this.lesson='complete'; }
    hud():CoachHUD {
        const progress=this.lesson==='bank' ? this.steering/5 : this.lesson==='throttle'
            ? (Math.min(1,this.boostTime/.5)+Math.min(1,this.brakeTime/.35))/2 : Number(this.lesson==='complete');
        return {lesson:this.lesson,progress:Math.min(1,progress),braking:this.boostTime>=.5};
    }
}

