import { type IconType } from '@/data/products';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import AirIcon from '@mui/icons-material/Air';
import BuildIcon from '@mui/icons-material/Build';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CategoryIcon from '@mui/icons-material/Category';
import ConstructionIcon from '@mui/icons-material/Construction';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import HandymanIcon from '@mui/icons-material/Handyman';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LayersIcon from '@mui/icons-material/Layers';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ScienceIcon from '@mui/icons-material/Science';
import SettingsIcon from '@mui/icons-material/Settings';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import WaterDropIcon from '@mui/icons-material/WaterDrop';

/**
 * Category label -> icon. Product data is EAV-driven and has no icon field of
 * its own, so the display icon is resolved client-side from the category name.
 * Keys are the 19 real top-level category names from CategoryTaxonomySeeder
 * (database/data/categories.csv). Unmapped categories fall back to a generic
 * icon via getCategoryIcon().
 */
export const CATEGORY_ICONS: Record<string, IconType> = {
    เครื่องมือไฟฟ้า: BuildIcon,
    อุปกรณ์เสริมเครื่องมือไฟฟ้า: ContentCutIcon,
    เครื่องมือสำหรับช่างก่อสร้าง: ConstructionIcon,
    อุปกรณ์ฮาร์ดแวร์และมีดคัตเตอร์: HandymanIcon,
    เครื่องมือสำหรับงานช่างอุตสาหกรรม: PrecisionManufacturingIcon,
    เครื่องมือลมและอุปกรณ์เสริม: AirIcon,
    อุปกรณ์เพื่อความปลอดภัย: HealthAndSafetyIcon,
    'เครื่องมือทำสวน-การเกษตรและเครื่องยนต์': AgricultureIcon,
    เคมีภัณฑ์และกาว: ScienceIcon,
    กล่องเคริ่องมือและอุปกรณ์จัดเก็บ: Inventory2OutlinedIcon,
    เบ็ดเตล็ด: CategoryIcon,
    ปั๊มน้ำ: WaterDropIcon,
    บรรจุภัณฑ์: LocalShippingIcon,
    'Customer Brand': StorefrontOutlinedIcon,
    วัตถุดิบ: LayersIcon,
    พรีเมี่ยมและของแถม: CardGiftcardIcon,
    หมายเหตุ: NoteAltIcon,
    อื่นๆ: MoreHorizIcon,
    อะไหล่: SettingsIcon,
};

export function getCategoryIcon(category: string): IconType {
    return CATEGORY_ICONS[category] ?? Inventory2OutlinedIcon;
}
