import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, Modal, TextInput,
  TouchableOpacity, ScrollView, useWindowDimensions,
  Share, Platform
} from 'react-native';
import { Calendar, WeekCalendar, CalendarProvider } from 'react-native-calendars';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Solar } from 'lunar-javascript';

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export default function App() {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  // --- 状态管理 ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('month');
  const [events, setEvents] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ title: '', msg: '', onConfirm: null, isConfirm: false });
  const [ioModalVisible, setIoModalVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);
  const [inputText, setInputText] = useState('');
  const [inputDesc, setInputDesc] = useState('');
  const [selHour, setSelHour] = useState('12');
  const [selMinute, setSelMinute] = useState('00');
  const [subUrl, setSubUrl] = useState('');

  // 动态高度（保持你的原比例）
  const CALENDAR_HEIGHT = viewMode === 'month' ? SCREEN_HEIGHT * 0.45 : 160;

  useEffect(() => { loadEvents(); }, []);

  // --- 核心逻辑适配：存储 ---
  const loadEvents = async () => {
    try {
      let saved;
      if (isWeb) {
        saved = localStorage.getItem('@final_calendar_data');
      } else {
        saved = await AsyncStorage.getItem('@final_calendar_data');
      }
      if (saved) setEvents(JSON.parse(saved));
    } catch (e) { console.log(e); }
  };

  const saveToStorage = async (data) => {
    setEvents(data);
    try {
      const str = JSON.stringify(data);
      if (isWeb) {
        localStorage.setItem('@final_calendar_data', str);
      } else {
        await AsyncStorage.setItem('@final_calendar_data', str);
      }
    } catch (e) { console.log(e); }
  };

  // --- 核心逻辑适配：分享 ---
  const handleExport = async () => {
    try {
      const dataString = JSON.stringify(events, null, 2);
      if (isWeb) {
        setImportText(dataString);
        triggerDialog("导出成功 (Web预览)", "数据已自动填充到下方的输入框中。");
      } else {
        await Share.share({ message: dataString, title: '我的日程备份' });
      }
    } catch (error) {
      triggerDialog("导出失败", error.message);
    }
  };

  const handleImport = () => {
    try {
      if (!importText.trim()) return;
      const parsedData = JSON.parse(importText);
      triggerDialog("确认导入", "导入将覆盖当前所有日程，确定继续吗？", async () => {
        await saveToStorage(parsedData);
        setIoModalVisible(false);
        setImportText('');
        triggerDialog("导入成功", "日程数据已同步完成");
      }, true);
    } catch (error) {
      triggerDialog("导入失败", "请确保粘贴的是有效的备份代码。");
    }
  };

  const handleSubscribe = async () => {
    if (!subUrl.trim() || !subUrl.startsWith('http')) {
      triggerDialog("输入无效", "请输入正确的 http 或 https 协议地址");
      return;
    }
    try {
      const response = await fetch(subUrl);
      if (!response.ok) throw new Error("服务器响应异常");
      const remoteData = await response.json();
      const newEvents = { ...events };
      Object.keys(remoteData).forEach(date => {
        if (newEvents[date]) {
          const remoteIds = new Set(remoteData[date].map(e => e.id));
          const localFiltered = newEvents[date].filter(e => !remoteIds.has(e.id));
          newEvents[date] = [...localFiltered, ...remoteData[date]];
        } else {
          newEvents[date] = remoteData[date];
        }
      });
      await saveToStorage(newEvents);
      triggerDialog("订阅成功", `已成功同步云端日程。`);
      setIoModalVisible(false);
    } catch (error) {
      triggerDialog("订阅失败", `原因：${error.message}`);
    }
  };

  const triggerDialog = (title, msg, onConfirm = null, isConfirm = false) => {
    setDialogConfig({ title, msg, onConfirm, isConfirm });
    setDialogVisible(true);
  };

  const checkIsExpired = (dateStr, timeStr) => {
    const now = new Date();
    const [h, m] = timeStr.split(':');
    const target = new Date(dateStr);
    target.setHours(parseInt(h), parseInt(m), 0);
    return target < now;
  };

  const handleSave = () => {
    if (!inputText) return;
    const timeStr = `${selHour}:${selMinute}`;
    const newEvents = { ...events };
    if (!newEvents[selectedDate]) newEvents[selectedDate] = [];
    if (editingEventId) {
      newEvents[selectedDate] = newEvents[selectedDate].map(ev =>
        ev.id === editingEventId ? { ...ev, title: inputText, desc: inputDesc, time: timeStr } : ev
      );
    } else {
      newEvents[selectedDate].push({ id: Date.now(), title: inputText, desc: inputDesc, time: timeStr });
    }
    saveToStorage(newEvents);
    closeModal();
  };

  const deleteEvent = (id) => {
    triggerDialog("确认删除", "确定要删除这条日程吗？", () => {
      const newEvents = { ...events };
      newEvents[selectedDate] = newEvents[selectedDate].filter(ev => ev.id !== id);
      saveToStorage(newEvents);
    }, true);
  };

  const closeModal = () => {
    setModalVisible(false); setDetailVisible(false); setEditingEventId(null);
    setInputText(''); setInputDesc(''); setSelHour('12'); setSelMinute('00'); setSelectedEvent(null);
  };

  const getWeekNumber = (date) => {
    const d = new Date(date);
    const dateCopy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    dateCopy.setUTCDate(dateCopy.getUTCDate() + 4 - (dateCopy.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(dateCopy.getUTCFullYear(), 0, 1));
    return Math.ceil((((dateCopy - yearStart) / 86400000) + 1) / 7);
  };

  const getLunar = (dateStr) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const lunar = Solar.fromYmd(y, m, d).getLunar();
      const festivals = [...lunar.getFestivals(), ...lunar.getSolar().getFestivals()];
      if (festivals.length > 0) return festivals[0];
      const jieQi = lunar.getJieQi();
      if (jieQi) return jieQi;
      const day = lunar.getDayInChinese();
      return day === '初一' ? `${lunar.getMonthInChinese()}月` : day;
    } catch (e) { return ""; }
  };

  const renderPickerColumn = (data, selectedValue, onSelect, label) => (
    <View style={styles.wheelColumn}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <View style={styles.wheelWrapper}>
        <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 50 }}>
          {data.map(item => (
            <TouchableOpacity key={item} onPress={() => onSelect(item)} style={[styles.wheelItem, selectedValue === item && styles.activeItem]}>
              <Text style={[styles.wheelText, selectedValue === item && styles.activeText]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderCustomDay = ({ date, state, marking }) => {
    const lunarInfo = getLunar(date.dateString);
    const isSelected = marking && marking.selected;
    const hasEvents = marking && marking.marked;
    const isToday = state === 'today';
    return (
      <TouchableOpacity
        style={[styles.customDay, isSelected && styles.selectedDayContainer]}
        onPress={() => setSelectedDate(date.dateString)}
      >
        <Text style={[styles.dayText, state === 'disabled' && styles.disabledText, isSelected && styles.selectedDayText, isToday && !isSelected && { color: '#00adf5' }]}>
          {date.day}
        </Text>
        <Text numberOfLines={1} style={[styles.lunarText, isSelected && styles.selectedDayText]}>
          {lunarInfo}
        </Text>
        {hasEvents && !isSelected && <View style={styles.eventDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isWeb && styles.webContainer]}>
      {/* 1. 顶部栏 */}
      <View style={styles.topSection}>
        <View style={styles.tabBar}>
          {['month', 'week', 'day'].map(m => (
            <TouchableOpacity key={m} onPress={() => setViewMode(m)} style={[styles.tab, viewMode === m && styles.activeTab]}>
              <Text style={[styles.tabText, viewMode === m && { color: '#fff' }]}>
                {m === 'month' ? '月' : m === 'week' ? '周' : '日'}视图
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={() => setIoModalVisible(true)} style={styles.adminBtn}>
          <Text style={styles.adminBtnText}>💾 备份与同步</Text>
        </TouchableOpacity>
      </View>

      {/* 2. 日历区 */}
      {viewMode !== 'day' && (
        <View style={[styles.calendarArea, { height: CALENDAR_HEIGHT }]}>
          <CalendarProvider date={selectedDate} onDateChanged={(date) => date && setSelectedDate(date)}>
            {viewMode === 'month' ? (
              <Calendar
                current={selectedDate}
                dayComponent={renderCustomDay}
                onDayPress={day => setSelectedDate(day.dateString)}
                markedDates={{
                  ...Object.keys(events).reduce((acc, d) => { if(events[d]?.length) acc[d] = {marked:true}; return acc; }, {}),
                  [selectedDate]: {selected: true}
                }}
                theme={{ calendarBackground: 'transparent' }}
              />
            ) : (
              <View style={{ flex: 1 }}>
                <View style={styles.weekNav}>
                  <Text style={styles.weekInfoText}>第 {getWeekNumber(selectedDate)} 周 | {getLunar(selectedDate)}</Text>
                </View>
                <WeekCalendar 
                  firstDay={1} 
                  onDayPress={day => setSelectedDate(day.dateString)} 
                  markedDates={{[selectedDate]: {selected: true, selectedColor: '#00adf5'}}}
                />
              </View>
            )}
          </CalendarProvider>
        </View>
      )}

      {/* 3. 列表区 */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.dateDisplay}>{selectedDate}</Text>
            <Text style={styles.lunarSmall}>{getLunar(selectedDate)}</Text>
          </View>
          <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
            <Text style={styles.fabText}>+ 新增事项</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={isWeb}>
          {(events[selectedDate] || []).length > 0 ? (
            [...(events[selectedDate] || [])].sort((a, b) => a.time.localeCompare(b.time)).map(item => {
              const isExpired = checkIsExpired(selectedDate, item.time);
              return (
                <View key={item.id} style={[styles.eventCard, isExpired && { opacity: 0.6 }]}>
                  <View style={styles.timeColumn}>
                    <Text style={styles.cardTime}>{item.time}</Text>
                    <View style={styles.timeDot} />
                    <View style={styles.timeLine} />
                  </View>
                  <TouchableOpacity style={styles.contentColumn} onPress={() => { setSelectedEvent(item); setDetailVisible(true); }}>
                    <Text style={[styles.cardTitle, isExpired && { textDecorationLine: 'line-through' }]}>{item.title}</Text>
                    {item.desc ? <Text numberOfLines={1} style={styles.cardDescPreview}>{item.desc}</Text> : null}
                    <View style={styles.cardFooter}>
                      <TouchableOpacity onPress={() => {
                        setEditingEventId(item.id); setInputText(item.title); setInputDesc(item.desc || '');
                        const [h, m] = item.time.split(':'); setSelHour(h); setSelMinute(m); setModalVisible(true);
                      }}><Text style={styles.editBtn}>编辑</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteEvent(item.id)}><Text style={styles.deleteBtn}>删除</Text></TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : <Text style={styles.emptyText}>☕ 暂无日程</Text>}
        </ScrollView>
      </View>

      {/* 以下 Modal 部分完全保留你的样式 */}
      {/* 导入导出 Modal */}
      <Modal visible={ioModalVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={[styles.ioBox, isWeb && {maxWidth: 400}]}>
            <Text style={styles.modalTitle}>同步中心</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport}><Text style={{ color: '#fff' }}>📤 导出/备份</Text></TouchableOpacity>
            <TextInput style={[styles.ioInput, {height: 45}]} placeholder="JSON 订阅地址" value={subUrl} onChangeText={setSubUrl} />
            <TouchableOpacity onPress={handleSubscribe} style={[styles.btnSave, {marginVertical: 10}]}><Text style={{color:'#fff', textAlign:'center'}}>云同步</Text></TouchableOpacity>
            <TextInput style={styles.ioInput} placeholder="粘贴备份代码导入" multiline scrollEnabled={true} value={importText} onChangeText={setImportText} />
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setIoModalVisible(false)} style={styles.btnCancel}><Text>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleImport} style={[styles.btnSave, {backgroundColor: '#28a745'}]}><Text style={{color:'#fff'}}>导入</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新增/编辑 Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isWeb && {maxWidth: 500, alignSelf: 'center', width: '100%', borderTopRightRadius: 20, borderTopLeftRadius: 20}]}>
            <Text style={styles.modalTitle}>{editingEventId ? '编辑' : '新建'}日程</Text>
            <TextInput style={styles.textInput} placeholder="事项" value={inputText} onChangeText={setInputText} />
            <TextInput style={[styles.textInput, {height: 60}]} placeholder="描述" multiline value={inputDesc} onChangeText={setInputDesc} />
            <View style={styles.pickerBox}>
              {renderPickerColumn(HOURS, selHour, setSelHour, "时")}
              <Text style={styles.pickerSeparator}>:</Text>
              {renderPickerColumn(MINUTES, selMinute, setSelMinute, "分")}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={closeModal} style={styles.btnCancel}><Text>取消</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.btnSave}><Text style={{color:'#fff'}}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

       <Modal visible={detailVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={[styles.detailBox, isWeb && {maxWidth: 400}]}>
            <Text style={styles.detailTitleText}>{selectedEvent?.title}</Text>
            <Text style={styles.detailDescText}>{selectedEvent?.desc || "无描述"}</Text>
            <TouchableOpacity onPress={closeModal} style={styles.detailCloseBtn}><Text style={{color:'#fff'}}>关闭</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={dialogVisible} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogBox, isWeb && {maxWidth: 350}]}>
            <Text style={styles.dialogTitle}>{dialogConfig.title}</Text>
            <Text style={styles.dialogMsg}>{dialogConfig.msg}</Text>
            <View style={styles.dialogFooter}>
              {dialogConfig.isConfirm && <TouchableOpacity onPress={() => setDialogVisible(false)} style={styles.dialogBtn}><Text>取消</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => { dialogConfig.onConfirm?.(); setDialogVisible(false); }} style={[styles.dialogBtn, {backgroundColor:'#00adf5'}]}><Text style={{color:'#fff'}}>确定</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  // 新增：Web端专属容器样式，保证在PC打开时也是手机比例，不拉伸
  webContainer: {
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#EEE',
    // 增加一点阴影让Web端看起来更高级
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  topSection: { paddingTop: Platform.OS === 'ios' ? 50 : 30, backgroundColor: '#F8F9FA', zIndex: 100 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 20 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20 },
  activeTab: { backgroundColor: '#00adf5' },
  tabText: { fontSize: 13, fontWeight: 'bold', color: '#666' },
  adminBtn: { marginHorizontal: 20, marginVertical: 10, padding: 5, borderRadius: 8, borderWidth: 1, borderColor: '#EEE', alignItems: 'center' },
  adminBtnText: { fontSize: 11, color: '#999' },
  
  calendarArea: { 
    backgroundColor: '#FFF', 
    borderBottomWidth: 1, 
    borderColor: '#F0F0F0',
    overflow: 'hidden' 
  },
  weekNav: { alignItems: 'center', paddingVertical: 5 },
  weekInfoText: { fontSize: 12, color: '#666', fontWeight: 'bold' },
  
  listSection: { flex: 1, paddingHorizontal: 20 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  dateDisplay: { fontSize: 20, fontWeight: 'bold' },
  lunarSmall: { color: '#00adf5', fontSize: 12 },
  fab: { backgroundColor: '#00adf5', padding: 8, borderRadius: 8 },
  fabText: { color: '#fff', fontSize: 12 },

  eventCard: { flexDirection: 'row', marginBottom: 15 },
  timeColumn: { width: 45, alignItems: 'center' },
  cardTime: { fontSize: 12, fontWeight: 'bold' },
  timeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00adf5', marginVertical: 5 },
  timeLine: { width: 1, flex: 1, backgroundColor: '#EEE' },
  contentColumn: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12, marginLeft: 5 },
  cardTitle: { fontSize: 15, fontWeight: 'bold' },
  cardDescPreview: { fontSize: 12, color: '#999', marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  editBtn: { color: '#00adf5', fontSize: 12, marginRight: 15 },
  deleteBtn: { color: '#FF5252', fontSize: 12 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#CCC' },

  customDay: { alignItems: 'center', justifyContent: 'center', height: 40, width: '100%' },
  selectedDayContainer: { backgroundColor: '#00adf5', borderRadius: 8 },
  dayText: { fontSize: 15 },
  lunarText: { fontSize: 9, color: '#999' },
  selectedDayText: { color: '#FFF' },
  disabledText: { color: '#EEE' },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#00adf5', marginTop: 2 },

  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  ioBox: { backgroundColor: '#FFF', width: '90%', borderRadius: 15, padding: 20 },
  ioInput: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, marginTop: 10, textAlignVertical: 'top', height: 100 },
  exportBtn: { backgroundColor: '#00adf5', padding: 12, borderRadius: 8, alignItems: 'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  textInput: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12, marginBottom: 10 },
  pickerBox: { flexDirection: 'row', height: 120, alignItems: 'center', backgroundColor: '#F9F9F9' },
  wheelColumn: { flex: 1, alignItems: 'center' },
  wheelLabel: { fontSize: 10, color: '#999' },
  wheelWrapper: { flex: 1, width: '100%' },
  wheelItem: { padding: 8, alignItems: 'center' },
  wheelText: { fontSize: 16 },
  activeItem: { backgroundColor: '#00adf5', borderRadius: 5 },
  activeText: { color: '#FFF' },
  pickerSeparator: { fontSize: 20, fontWeight: 'bold', color: '#00adf5' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 },
  btnCancel: { padding: 10, marginRight: 10 },
  btnSave: { backgroundColor: '#00adf5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },

  detailBox: { backgroundColor: '#FFF', width: '80%', padding: 20, borderRadius: 15 },
  detailTitleText: { fontSize: 18, fontWeight: 'bold' },
  detailDescText: { marginVertical: 15, color: '#666', lineHeight: 20 },
  detailCloseBtn: { backgroundColor: '#00adf5', padding: 10, borderRadius: 8, alignItems: 'center' },
  dialogBox: { backgroundColor: '#FFF', width: '70%', padding: 20, borderRadius: 15, alignItems: 'center' },
  dialogTitle: { fontWeight: 'bold', fontSize: 16 },
  dialogMsg: { marginVertical: 10, textAlign: 'center', color: '#666' },
  dialogFooter: { flexDirection: 'row', marginTop: 10 },
  dialogBtn: { padding: 10, borderRadius: 5, marginHorizontal: 5 }
});