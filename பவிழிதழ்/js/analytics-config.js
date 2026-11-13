/* பவிழிதழ் வாசகர் வருகைக் கணக்கு – GoatCounter அமைப்பு

1) https://www.goatcounter.com/ இல் இலவசமாக Site உருவாக்கவும்.
2) Site domain ஆக உங்கள் Netlify முகவரியை (உதா: roaring-gnome-991dea.netlify.app) கொடுக்கவும்.
3) GoatCounter Settings இல் “Allow adding visitor counts on your website” என்பதை ON செய்யவும்.
4) Admin > பொதுவான தள அமைப்புகள் பகுதியில் GoatCounter Site Code-ஐ உள்ளிட்டு சேமிக்கலாம். தேவையெனில் கீழே உள்ள code-ஐ நேரடியாக அமைக்கலாம்.
   உதாரணம்: https://pavizhidhal.goatcounter.com என்றால் code = "pavizhidhal"
5) இந்தக் கோப்பைச் சேமித்து Website-ஐ Netlify-ல் மீண்டும் Deploy செய்யவும்.

குறிப்பு: இது பொதுவான Site Code மட்டுமே; API Secret / Password அல்ல.
GoatCounter இணைக்கப்படும் வரை கணக்குகள் போலியாக 0 என்று காட்டப்படாது.
இது Supabase Database, Tables, Policies அல்லது Keys-ஐப் பயன்படுத்தாது.
*/
window.PAVIZHIDHAL_GOATCOUNTER_CODE = ""; // Admin அமைப்பில் உள்ள code முன்னுரிமை பெறும்.
