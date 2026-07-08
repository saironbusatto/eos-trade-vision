#!/usr/bin/env python3
"""
EOS - Eye of Sauron - Gerador de Imagens
Sauron sempre aparece como personagem.
A IA interpreta a frase para gerar a cena visual.
"""

import os
import sys
import httpx
import time
from pathlib import Path
from urllib.parse import quote as urlquote

def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

load_env()

# Sauron - sempre aparece assim
SAURON_BASE = (
    "Sauron the Dark Lord from Lord of the Rings, "
    "towering armored figure in black spiked plate armor, "
    "dark angular helmet with glowing red-orange eye visible through visor, "
    "holding massive black mace, dark ethereal cape flowing, "
    "ancient dark sorcerer aura, One Ring glowing on finger"
)

# Palavras-chave na frase mapeiam para elementos visuais
QUOTE_VISUAL_MAP = {
    # Poder / Anel
    "anel": "the One Ring floating and glowing intensely in foreground, golden light emanating",
    "governar": "throne of dark iron and obsidian, crown of shadows",
    "poder": "crackling dark energy around his hands, lightning striking behind",
    "domínio": "vast dark kingdom stretching to horizon, armies below",
    "império": "colossal dark tower Barad-dûr dominating skyline",
    # Guerra / Exército
    "guerra": "massive battle scene, swords clashing, fire and destruction",
    "exército": "thousands of orcs and nazgûl army marching in formation",
    "destruição": "cities burning, ruins crumbling, apocalyptic devastation",
    "morte": "field of fallen warriors, dark ravens circling overhead",
    "tormento": "souls writhing in darkness, chains of shadow",
    # Escuridão / Medo
    "escuridão": "absolute darkness with only his glowing eye piercing through",
    "sombra": "enormous shadow looming over cowering figures",
    "medo": "terrified figures fleeing in foreground, his silhouette towering above",
    "noite": "eclipse blocking all light, stars extinguished",
    "trevas": "thick oppressive darkness swirling around him",
    # Olho / Vigilância
    "olho": "extreme close-up of the Eye of Sauron, fiery lidless eye in flames",
    "vejo": "all-seeing eye scanning, countless scenes reflected in the eye",
    "esconder": "figures hiding in shadows while the eye searches above",
    # Fogo / lava
    "fogo": "rivers of lava, volcanic eruption, everything ablaze",
    "lava": "molten rock cascading down mountains, glowing orange rivers",
    "cinzas": "burnt landscape, ash falling like snow, devastation",
    "fornalha": "massive volcanic forge, the One Ring being created in fire",
    # Desafio / orgulho
    "desafiar": "Sauron raising mace defiantly, power radiating outward",
    "orgulho": "Sauron standing victorious atop a mountain of skulls",
    "inútil": "crushed weapons and broken shields at his feet",
    "fútil": "tiny figure struggling uselessly against his overwhelming power",
    # Corrupção
    "corrompido": "twisted figures, faces showing corruption, dark tendrils",
    "escravidão": "chains of dark energy, bound figures kneeling",
    "servo": "kneeling warriors bound by shadow chains",
    # Tempo / Destino
    "destino": "ancient prophecy scrolls burning, fate sealed in fire",
    "eterno": "time-lapse showing civilizations rising and falling while he stands unchanged",
    "séculos": "ancient ruins with his shadow still looming, passage of ages",
    "iminente": "dramatic storm approaching, darkness about to consume everything",
    # Natureza / Mundo
    "mundo": "panoramic view of Middle-earth under his shadow",
    "terra": "the ground cracking and splitting apart under his feet",
    "céu": "sky torn apart, stars dying, cosmic destruction",
    # Frases curtas devastadoras
    "vejo você": "extreme close-up of the Eye of Sauron staring directly at viewer",
    "perdeu": "Sauron standing over defeated enemies, victory pose",
    "fuga": "maze of darkness with no exit, his eye watching from above",
    "inevitável": "towering unstoppable figure walking forward, everything crumbling",
}

def interpret_quote_visual(quote):
    """Interpreta a frase e retorna elementos visuais"""
    quote_lower = quote.lower()
    visual_elements = []
    
    for keyword, visual in QUOTE_VISUAL_MAP.items():
        if keyword in quote_lower:
            visual_elements.append(visual)
    
    if not visual_elements:
        # Fallback baseado em palavras gerais
        if any(w in quote_lower for w in ["morrer", "morte", "acabou", "fim"]):
            visual_elements.append("dramatic death scene, dark final moment")
        elif any(w in quote_lower for w in ["poder", "grande", "lord", "senhor"]):
            visual_elements.append("regal powerful stance, crown of shadows")
        elif any(w in quote_lower for w in ["olho", "vejo", "ve"]):
            visual_elements.append("the Eye of Sauron burning intensely")
        else:
            visual_elements.append("dramatic cinematic composition with ominous atmosphere")
    
    return ", ".join(visual_elements[:3])  # Max 3 elementos

def get_intensity(score):
    if score >= 85: return "extreme"
    elif score >= 70: return "high"
    elif score >= 55: return "medium"
    else: return "low"

INTENSITY_MOOD = {
    "extreme": "apocalyptic, all-consuming, absolute power",
    "high": "dominant, powerful, unstoppable force",
    "medium": "menacing, confident, scheming",
    "low": "watchful, patient, calculating"
}

INTENSITY_BG = {
    "extreme": "Mordor in total war, Mount Doom erupting massively, thousands of torches, sky burning red",
    "high": "Mount Doom erupting with lava, army marching, dark sky with red lightning",
    "medium": "dark fortress Barad-dûr in distance, storm clouds, flickering fires",
    "low": "misty mountains at dawn, soft orange glow, quiet ominous atmosphere"
}

def generate_sauron_image(symbol, direction, score, quote, output_path):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        return None
    
    intensity = get_intensity(score)
    mood = INTENSITY_MOOD[intensity]
    bg = INTENSITY_BG[intensity]
    quote_visual = interpret_quote_visual(quote)
    
    prompt = (
        f"Epic dark fantasy digital art, cinematic composition, dramatic lighting. "
        f"{SAURON_BASE}, "
        f"standing in {bg}. "
        f"Visual elements from his words: {quote_visual}. "
        f"He appears {mood}. "
        f"Ancient ruins and dark towers surround him. "
        f"Style: Lord of the Rings movie aesthetic, hyper detailed, 4k, "
        f"dark color palette with intense orange and red accents from fire and lava"
    )
    
    print(f"[Sauron] Quote: \"{quote}\"")
    print(f"[Sauron] Visual: {quote_visual}")
    print(f"[Sauron] Generating for {symbol} (score: {score}%)")
    
    try:
        with httpx.Client() as client:
            response = client.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "size": "1024x1024",
                    "quality": "standard",
                    "n": 1,
                    "response_format": "url"
                },
                timeout=120
            )
            response.raise_for_status()
            data = response.json()
            
            image_url = data["data"][0]["url"]
            
            img_response = client.get(image_url, timeout=30)
            img_response.raise_for_status()
            
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(img_response.content)
            
            file_size = os.path.getsize(output_path)
            print(f"[Sauron] Saved: {output_path} ({file_size / 1024:.1f} KB)")
            return output_path
            
    except Exception as e:
        print(f"[Sauron] DALL-E error: {e}")
        return generate_pollinations_fallback(prompt, output_path)

def generate_pollinations_fallback(prompt, output_path):
    encoded = urlquote(prompt[:500])
    url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"
    
    try:
        with httpx.Client() as client:
            response = client.get(url, timeout=90, follow_redirects=True)
            response.raise_for_status()
            
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(response.content)
            
            file_size = os.path.getsize(output_path)
            print(f"[Sauron] Fallback: {output_path} ({file_size / 1024:.1f} KB)")
            return output_path
            
    except Exception as e:
        print(f"[Sauron] Fallback failed: {e}")
        return None

def main():
    if len(sys.argv) < 4:
        print("Usage: generate-sauron.py <symbol> <BUY|SELL> <score> [quote] [output.jpg]")
        sys.exit(1)
    
    symbol = sys.argv[1]
    direction = sys.argv[2].upper()
    score = float(sys.argv[3])
    quote = sys.argv[4] if len(sys.argv) > 4 and not sys.argv[4].endswith(".jpg") else "O Olho ve tudo."
    output_path = sys.argv[5] if len(sys.argv) > 5 else None
    
    if not output_path:
        ts = int(time.time())
        cache_dir = Path("/tmp/eos-sauron")
        cache_dir.mkdir(exist_ok=True)
        output_path = str(cache_dir / f"sauron-{symbol}-{ts}.jpg")
    
    result = generate_sauron_image(symbol, direction, score, quote, output_path)
    
    if result:
        print(f"SUCCESS:{result}")
        sys.exit(0)
    else:
        print("FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()
