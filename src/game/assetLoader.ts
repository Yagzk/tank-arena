class AssetLoader {
  private images: Record<string, HTMLImageElement> = {};
  private loaded: boolean = false;

  public loadAll() {
    if (this.loaded || typeof window === 'undefined') return;
    this.loaded = true;

    const assetList: Record<string, string> = {
      shelly: '/assets/shelly.png',
      colt: '/assets/colt.png',
      el_primo: '/assets/el_primo.png',
      brock: '/assets/brock.png',
      spike: '/assets/spike.png',
      leon: '/assets/leon.png',
      gem: '/assets/gem.png',
      power_cube: '/assets/power_cube.png',
    };

    for (const [key, src] of Object.entries(assetList)) {
      const img = new Image();
      img.src = src;
      this.images[key] = img;
    }
  }

  public getImage(key: string): HTMLImageElement | null {
    if (!this.loaded) {
      this.loadAll();
    }
    const img = this.images[key];
    if (img && img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }
}

export const assetLoader = new AssetLoader();
