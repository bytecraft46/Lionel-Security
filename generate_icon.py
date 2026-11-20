import math
from PIL import Image, ImageDraw

def create_fingerprint_icon(size=1024):
    # 4x supersampling for ultra-crisp antialiasing
    scale = 2
    dim = size * scale
    img = Image.new('RGBA', (dim, dim), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = dim // 2, dim // 2
    radius = int(dim * 0.44)

    # 1. Background Circle / Squircle (DutyDesk Purple #7C3AED with subtle gradient or soft lilac #EDE9FE)
    # The login form has a circle with #EDE9FE background and #DDD6FE border, and #7C3AED fingerprint
    # For a high-contrast app launcher icon that looks stunning on dark/light phone home screens:
    # A rich vibrant DutyDesk Royal Purple #7C3AED circle with an inner soft lilac accent and crisp white/light fingerprint
    
    # Outer circle #7C3AED
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(124, 58, 237, 255))
    
    # Subtle inner border ring
    inner_ring_r = int(radius * 0.94)
    draw.ellipse([cx - inner_ring_r, cy - inner_ring_r, cx + inner_ring_r, cy + inner_ring_r], 
                 outline=(167, 139, 250, 80), width=int(6 * scale))

    # 2. Draw Fingerprint Ridges in Pure Crisp White with smooth rounded endpoints
    # Fingerprint ridges:
    ridge_color = (255, 255, 255, 255)
    ridge_w = int(22 * scale)

    # Ridge 1 (Innermost core loop)
    # Center core loop: an ellipse arc around (cx, cy)
    r1_x = int(60 * scale)
    r1_y = int(90 * scale)
    draw.arc([cx - r1_x, cy - r1_y, cx + r1_x, cy + r1_y], start=180, end=360, fill=ridge_color, width=ridge_w)
    # Descending right leg
    draw.line([cx + r1_x, cy, cx + r1_x, cy + int(70 * scale)], fill=ridge_color, width=ridge_w)
    # Descending left leg curving inward
    draw.arc([cx - r1_x - int(30 * scale), cy + int(30 * scale), cx - r1_x + int(30 * scale), cy + int(90 * scale)],
             start=270, end=90, fill=ridge_color, width=ridge_w)

    # Ridge 2 (Middle loop)
    r2_x = int(120 * scale)
    r2_y = int(160 * scale)
    draw.arc([cx - r2_x, cy - r2_y, cx + r2_x, cy + r2_y], start=180, end=360, fill=ridge_color, width=ridge_w)
    draw.line([cx + r2_x, cy, cx + r2_x, cy + int(140 * scale)], fill=ridge_color, width=ridge_w)
    draw.line([cx - r2_x, cy, cx - r2_x, cy + int(110 * scale)], fill=ridge_color, width=ridge_w)

    # Ridge 3 (Outer loop)
    r3_x = int(180 * scale)
    r3_y = int(230 * scale)
    draw.arc([cx - r3_x, cy - r3_y, cx + r3_x, cy + r3_y], start=180, end=360, fill=ridge_color, width=ridge_w)
    draw.line([cx + r3_x, cy, cx + r3_x, cy + int(190 * scale)], fill=ridge_color, width=ridge_w)
    draw.line([cx - r3_x, cy, cx - r3_x, cy + int(170 * scale)], fill=ridge_color, width=ridge_w)

    # Ridge 4 (Top outermost arch)
    r4_x = int(240 * scale)
    r4_y = int(300 * scale)
    draw.arc([cx - r4_x, cy - r4_y, cx + r4_x, cy + r4_y], start=195, end=345, fill=ridge_color, width=ridge_w)
    
    # Outer flank arches at bottom
    # Bottom right flank
    draw.arc([cx + int(140 * scale), cy + int(90 * scale), cx + int(240 * scale), cy + int(240 * scale)],
             start=0, end=140, fill=ridge_color, width=ridge_w)
    # Bottom left flank
    draw.arc([cx - int(240 * scale), cy + int(90 * scale), cx - int(140 * scale), cy + int(240 * scale)],
             start=40, end=180, fill=ridge_color, width=ridge_w)

    # Central core dot / tiny arc
    draw.ellipse([cx - int(12 * scale), cy - int(10 * scale), cx + int(12 * scale), cy + int(14 * scale)], fill=ridge_color)

    # Downsample with Lanczos for smooth antialiasing
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

if __name__ == '__main__':
    img = create_fingerprint_icon(512)
    img.save(r'C:\DutyDesk\test_fingerprint.png')
    print("Generated 512x512 fingerprint icon successfully!")
