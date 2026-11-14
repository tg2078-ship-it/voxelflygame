/** Pointer cancellation is scoped to the finger that pressed this control. */
export class PointerOwner {
    private id: number | null = null;
    claim(id: number) { if (this.id !== null) return false; this.id = id; return true; }
    owns(id: number) { return this.id === id; }
    release(id: number) { if (!this.owns(id)) return false; this.id = null; return true; }
    reset() { this.id = null; }
}
